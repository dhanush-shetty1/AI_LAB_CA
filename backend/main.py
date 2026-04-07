import io
import json
import os
import csv
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import google.generativeai as genai
from pypdf import PdfReader
import pdfplumber
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

app = FastAPI(title="Agentic AI Academic Planner", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEMORY_FILE = Path(__file__).parent / "planner_memory.json"
CSV_FILE = Path(__file__).parent / "study_plan.csv"

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-pro")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    genai_client = True
else:
    genai_client = None


class SubjectInput(BaseModel):
    name: str
    exam_date: date


class PlanRequest(BaseModel):
    subjects: Optional[List[SubjectInput]] = None
    hours_per_day: Optional[float] = 5
    weak_subjects: Optional[List[str]] = None
    syllabus_text: Optional[str] = None
    timetable_text: Optional[str] = None
    use_memory: bool = True


def load_last_plan():
    if MEMORY_FILE.exists():
        with open(MEMORY_FILE, "r") as f:
            return json.load(f)
    return None


def save_last_plan(plan):
    with open(MEMORY_FILE, "w") as f:
        json.dump(plan, f, indent=2)


def format_hours_mins(decimal_hours):
    try:
        val = float(decimal_hours)
        mins = int(round(val * 60))
        h = mins // 60
        m = mins % 60
        if h > 0 and m > 0:
            return f"{h}h {m}m"
        if h > 0:
            return f"{h}h"
        return f"{m}m"
    except Exception:
        return str(decimal_hours)


def deadline_analyzer_tool(subjects):
    today = date.today()
    results = []
    for sub in subjects:
        days_left = max(1, (sub.exam_date - today).days)
        urgency = "high" if days_left <= 7 else "medium" if days_left <= 21 else "low"
        results.append({
            "subject": sub.name,
            "exam_date": sub.exam_date.isoformat(),
            "days_left": days_left,
            "urgency": urgency
        })
    return sorted(results, key=lambda x: x["days_left"])


def study_time_allocator_tool(deadline_data, hours_per_day, weak_subjects):
    weak_subjects = [s.lower() for s in (weak_subjects or [])]
    total_days = sum(item["days_left"] for item in deadline_data)

    weights = {}
    for item in deadline_data:
        inverse_weight = total_days / item["days_left"]
        if item["subject"].lower() in weak_subjects:
            inverse_weight *= 1.4
        weights[item["subject"]] = inverse_weight

    total_weight = sum(weights.values())
    allocations = []
    for subject, weight in weights.items():
        hours = round((weight / total_weight) * hours_per_day, 2)
        allocations.append({"subject": subject, "hours_per_day": hours})

    return {
        "total_hours_per_day": hours_per_day,
        "allocations": allocations
    }


def extract_text_from_pdf_bytes(pdf_bytes):
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = "\n".join([p.extract_text() or "" for p in reader.pages])
        if text.strip():
            return text
    except Exception:
        pass
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            return "\n".join([p.extract_text() or "" for p in pdf.pages])
    except Exception:
        return ""


DATE_LINE_PATTERN = re.compile(
    r"^\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s*$",
    re.IGNORECASE
)
TIME_LINE_PATTERN = re.compile(r"\d{1,2}:\d{2}\s*(AM|PM)", re.IGNORECASE)
SKIP_WORDS = {"date", "subject", "time", "day", "exam"}


def parse_subjects_from_timetable_text(text):
    lines = [l.strip() for l in text.splitlines()]
    subjects = []
    seen = set()
    i = 0

    while i < len(lines):
        line = lines[i]
        m = DATE_LINE_PATTERN.match(line)
        if m:
            try:
                parsed_date = datetime.strptime(
                    f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %B %Y"
                ).date()
            except Exception:
                i += 1
                continue

            j = i + 1
            while j < len(lines):
                candidate = lines[j].strip()
                if (
                    not candidate
                    or candidate.lower() in SKIP_WORDS
                    or TIME_LINE_PATTERN.search(candidate)
                    or DATE_LINE_PATTERN.match(candidate)
                ):
                    j += 1
                    continue
                key = candidate.lower()
                if key not in seen:
                    seen.add(key)
                    subjects.append(SubjectInput(name=candidate, exam_date=parsed_date))
                i = j
                break
        i += 1

    return subjects


def call_gemini(prompt):
    model = genai.GenerativeModel(MODEL_NAME)
    response = model.generate_content(prompt)
    return (
        response.text
        if hasattr(response, "text")
        else response.candidates[0].content.parts[0].text
    )


def extract_subjects_via_gemini(timetable_text):
    prompt = f"""You are given an exam timetable. Extract every subject name and its exam date.

Return ONLY a valid JSON array. No markdown, no code fences, no explanation. Just the raw JSON array.

Example output:
[{{"name": "DSIP", "exam_date": "2026-05-05"}}, {{"name": "NIS", "exam_date": "2026-05-08"}}]

Timetable text:
{timetable_text[:4000]}"""

    try:
        raw = call_gemini(prompt)
        raw = raw.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        raw = raw.strip()
        start = raw.find("[")
        end = raw.rfind("]")
        if start == -1 or end == -1:
            return []
        parsed = json.loads(raw[start:end + 1])
        subjects = []
        for s in parsed:
            try:
                subjects.append(SubjectInput(
                    name=s["name"].strip(),
                    exam_date=date.fromisoformat(s["exam_date"])
                ))
            except Exception:
                continue
        return subjects
    except Exception:
        return []


def build_study_plan_via_gemini(deadline_data, allocation, syllabus_text):
    alloc_map = {a["subject"]: a["hours_per_day"] for a in allocation["allocations"]}

    subjects_payload = [
        {
            "subject": item["subject"],
            "exam_date": item["exam_date"],
            "days_left": item["days_left"],
            "urgency": item["urgency"],
            "hours_per_day": alloc_map.get(item["subject"], 1.0)
        }
        for item in deadline_data
    ]

    syllabus_snippet = (syllabus_text or "Not provided")[:3000]

    prompt = f"""You are an academic study planner AI.

Create a personalised daily study plan for each subject below.
Each subject already has its daily study hours calculated — use them exactly as given.
Use the syllabus to write specific, actionable daily goals and focus topics per subject.

Subjects with allocated hours and deadlines:
{json.dumps(subjects_payload, indent=2)}

Syllabus context:
{syllabus_snippet}

Return ONLY a valid JSON object. No markdown, no code fences. Just raw JSON.

IMPORTANT: The subject names in your response must exactly match the subject names given above.

Format:
{{
  "study_plan": [
    {{
      "subject": "Subject Name",
      "daily_goal": "Specific actionable goal for the day based on syllabus",
      "focus_topics": ["Topic 1", "Topic 2", "Topic 3"]
    }}
  ],
  "priority_list": ["Subject1", "Subject2", "Subject3"],
  "adjustment_notes": "Brief reasoning on priority and time allocation"
}}"""

    try:
        raw = call_gemini(prompt)
        raw = raw.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        raw = raw.strip()
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1:
            return None
        return json.loads(raw[start:end + 1])
    except Exception:
        return None


def normalize(s):
    return s.strip().lower()


def generate_csv(result, deadline_data, allocation):
    alloc_map = {normalize(a["subject"]): a["hours_per_day"] for a in allocation["allocations"]}
    deadline_map = {normalize(d["subject"]): d for d in deadline_data}
    plan_map = {normalize(item["subject"]): item for item in result.get("study_plan", [])}

    all_subjects = list(deadline_map.keys())

    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Subject", "Exam Date", "Days Left", "Urgency", "Hours/Day", "Daily Goal", "Focus Topics"])
        
        for key in all_subjects:
            d = deadline_map.get(key, {})
            p = plan_map.get(key, {})
            
            raw_hours = alloc_map.get(key, 0)
            formatted_time = format_hours_mins(raw_hours)

            raw_date = d.get("exam_date", "")
            try:
                dt = datetime.strptime(raw_date, "%Y-%m-%d")
                # COMPACT FORCE TEXT: Fits Excel width and prevents auto-formatting issues.
                formatted_date = f"'{dt.day} {dt.strftime('%b')}"
            except Exception:
                formatted_date = raw_date
            
            writer.writerow([
                d.get("subject", key.upper()),
                formatted_date,
                d.get("days_left", ""),
                d.get("urgency", ""),
                formatted_time,
                p.get("daily_goal", ""),
                ", ".join(p.get("focus_topics", []))
            ])


@app.post("/upload-syllabus")
async def upload_syllabus(file: UploadFile = File(...)):
    text = extract_text_from_pdf_bytes(await file.read())
    return {"syllabus_text": text[:12000]}


@app.post("/upload-timetable")
async def upload_timetable(file: UploadFile = File(...)):
    text = extract_text_from_pdf_bytes(await file.read())
    return {"timetable_text": text[:12000]}


@app.post("/plan")
def generate_plan(request: PlanRequest):
    subjects = list(request.subjects or [])

    if not subjects and request.timetable_text:
        subjects = parse_subjects_from_timetable_text(request.timetable_text)

    if not subjects and request.timetable_text:
        subjects = extract_subjects_via_gemini(request.timetable_text)

    if not subjects:
        raise HTTPException(400, "No subjects found")

    deadline_data = deadline_analyzer_tool(subjects)
    allocation = study_time_allocator_tool(
        deadline_data,
        request.hours_per_day or 5,
        request.weak_subjects or []
    )

    final_plan = build_study_plan_via_gemini(
        deadline_data,
        allocation,
        request.syllabus_text or ""
    )

    if not final_plan:
        alloc_lookup = {a["subject"]: a["hours_per_day"] for a in allocation["allocations"]}
        fallback_study_plan = []
        
        # Subject-Specific Fallback Matrix
        strategy_matrix = {
            "dsip": {
                "goal": "Signal Processing Mastery: Dedicate {time_str} to practicing Fourier Transform derivations and image enhancement algorithms.",
                "topics": ["Fourier Transform", "Image Enhancement", "Filtering"]
            },
            "nis": {
                "goal": "Security Protocol Review: Utilize {time_str} to map out Cryptography basics and IDS/Firewall architectures.",
                "topics": ["Cryptography", "Network Protocols", "Ethical Hacking"]
            },
            "cc": {
                "goal": "Cloud Infrastructure Deep-Dive: Use {time_str} to compare IaaS/PaaS/SaaS models and cloud security virtualization.",
                "topics": ["Cloud Models", "Virtualization", "AWS/Azure Basics"]
            },
            "ai": {
                "goal": "Intelligence Logic Drill: Spend {time_str} solving Search Algorithm trees and reviewing Machine Learning Neural Networks.",
                "topics": ["Search Algorithms", "Machine Learning", "Neural Networks"]
            }
        }
        
        for item in deadline_data:
            sub = item["subject"]
            sub_key = sub.lower()
            days = item["days_left"]
            time_str = format_hours_mins(alloc_lookup.get(sub, 1.0))
            
            # Select specific strategy or general fallback
            strategy = strategy_matrix.get(sub_key)
            if strategy:
                goal = strategy["goal"].format(time_str=time_str)
                topics = strategy["topics"]
            else:
                if days <= 14:
                    goal = f"Urgent Revision: Utilize {time_str} for high-intensity active recall on core {sub} concepts."
                else:
                    goal = f"Foundational Phase: Spend {time_str} today mapping the {sub} syllabus modules into your notes."
                topics = ["Syllabus Review", "Key Concepts"]

            fallback_study_plan.append({
                "subject": sub,
                "daily_goal": goal,
                "focus_topics": topics
            })

        final_plan = {
            "study_plan": fallback_study_plan,
            "priority_list": [item["subject"] for item in deadline_data],
            "adjustment_notes": "AI fallback matrix applied with subject-specific module mapping."
        }

    result = {
        "generated_at": datetime.now(timezone.utc).strftime("%b-%d_%H-%M"),
        "study_plan": final_plan.get("study_plan", []),
        "priority_list": final_plan.get("priority_list", []),
        "time_allocation": allocation,
        "adjustment_notes": final_plan.get("adjustment_notes", ""),
    }

    generate_csv(result, deadline_data, allocation)
    result["csv"] = "study_plan.csv"

    save_last_plan(result)

    return result


@app.get("/download-csv")
def download_csv():
    if not CSV_FILE.exists():
        raise HTTPException(status_code=404, detail="CSV not found. Generate a plan first.")
    return FileResponse(path=CSV_FILE, media_type="text/csv", filename="study_plan.csv")