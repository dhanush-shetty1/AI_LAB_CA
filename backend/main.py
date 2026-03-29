import io
import json
import os
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from pypdf import PdfReader
from pydantic import BaseModel, Field
from dotenv import load_dotenv


load_dotenv(Path(__file__).parent / ".env")


# -----------------------------
# App and configuration
# -----------------------------
app = FastAPI(title="Agentic AI Academic Planner", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo/evaluation; tighten for production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEMORY_FILE = Path(__file__).parent / "planner_memory.json"
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

if GEMINI_API_KEY:
    genai_client = genai.Client(api_key=GEMINI_API_KEY)
else:
    genai_client = None


# -----------------------------
# Request/response schemas
# -----------------------------
class SubjectInput(BaseModel):
    name: str = Field(..., min_length=1)
    exam_date: date


class PlanRequest(BaseModel):
    subjects: List[SubjectInput]
    hours_per_day: float = Field(..., gt=0, le=24)
    weak_subjects: List[str] = Field(default_factory=list)
    syllabus_text: Optional[str] = None
    use_memory: bool = True


# -----------------------------
# Memory tool
# -----------------------------
def load_last_plan() -> Optional[Dict[str, Any]]:
    if not MEMORY_FILE.exists():
        return None
    try:
        with open(MEMORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def save_last_plan(plan: Dict[str, Any]) -> None:
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(plan, f, indent=2, ensure_ascii=True)


# -----------------------------
# Tool 1: Deadline Analyzer
# -----------------------------
def deadline_analyzer_tool(subjects: List[SubjectInput]) -> List[Dict[str, Any]]:
    today = date.today()
    results = []
    for sub in subjects:
        days_left = (sub.exam_date - today).days
        urgency = "high" if days_left <= 7 else "medium" if days_left <= 21 else "low"
        results.append(
            {
                "subject": sub.name,
                "exam_date": sub.exam_date.isoformat(),
                "days_left": days_left,
                "urgency": urgency,
            }
        )
    results.sort(key=lambda x: x["days_left"])
    return results


# -----------------------------
# Tool 2: Study Time Allocator
# -----------------------------
def study_time_allocator_tool(
    deadline_data: List[Dict[str, Any]],
    hours_per_day: float,
    weak_subjects: List[str],
) -> Dict[str, Any]:
    weight_map = {"high": 3.0, "medium": 2.0, "low": 1.0}
    weak_set = {w.strip().lower() for w in weak_subjects}

    weighted_subjects = []
    for item in deadline_data:
        base_weight = weight_map.get(item["urgency"], 1.0)
        if item["subject"].strip().lower() in weak_set:
            base_weight += 1.0
        weighted_subjects.append((item["subject"], base_weight))

    total_weight = sum(w for _, w in weighted_subjects) or 1.0
    allocation = []
    for subject, weight in weighted_subjects:
        hours = round((weight / total_weight) * hours_per_day, 2)
        allocation.append({"subject": subject, "hours_per_day": hours})

    # Normalize rounding drift to preserve total hours_per_day exactly.
    drift = round(hours_per_day - sum(a["hours_per_day"] for a in allocation), 2)
    if allocation and drift != 0:
        allocation[0]["hours_per_day"] = round(allocation[0]["hours_per_day"] + drift, 2)

    return {
        "total_hours_per_day": hours_per_day,
        "allocations": allocation,
    }


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    if not pdf_bytes:
        return ""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    text_chunks: List[str] = []
    for page in reader.pages:
        text_chunks.append(page.extract_text() or "")
    return "\n".join(text_chunks).strip()


# -----------------------------
# LLM utility
# -----------------------------
def call_gemini_for_plan(
    user_request: PlanRequest,
    deadline_data: List[Dict[str, Any]],
    time_allocation: Dict[str, Any],
    prior_plan: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Missing GEMINI_API_KEY environment variable.")

    prompt = f"""
You are an academic planning AI. Return ONLY valid JSON.

Create a concise study plan using this structure exactly:
{{
  "study_plan": [
    {{
      "subject": "string",
      "focus_topics": ["string"],
      "daily_goal": "string"
    }}
  ],
  "priority_list": ["subject names in order"],
  "time_allocation": {{
    "total_hours_per_day": number,
    "allocations": [
      {{"subject": "string", "hours_per_day": number}}
    ]
  }},
  "adjustment_notes": "string"
}}

Input data:
- Subjects with exam data: {json.dumps(deadline_data)}
- Time allocation proposal: {json.dumps(time_allocation)}
- Weak subjects: {json.dumps(user_request.weak_subjects)}
- Syllabus text (optional): {json.dumps((user_request.syllabus_text or "")[:12000])}
- Previous plan memory (optional): {json.dumps(prior_plan) if prior_plan else "null"}

Rules:
1) Prioritize subjects with fewer days left.
2) Give extra revision intensity to weak subjects.
3) Keep plan realistic for a student.
4) Ensure priority_list matches urgency.
5) Output JSON only; no markdown.
"""
    # Prefer stronger free models first, then fallback for compatibility.
    candidate_models = [MODEL_NAME, "gemini-2.0-flash", "gemini-1.5-flash"]
    seen = set()
    ordered_candidates = []
    for model_name in candidate_models:
        if model_name and model_name not in seen:
            seen.add(model_name)
            ordered_candidates.append(model_name)

    response = None
    last_error: Optional[Exception] = None
    for model_name in ordered_candidates:
        try:
            response = genai_client.models.generate_content(
                model=model_name,
                contents=prompt,
            )
            break
        except Exception as exc:
            last_error = exc
            continue

    if response is None:
        raise HTTPException(
            status_code=500,
            detail=f"All Gemini model attempts failed. Last error: {last_error}",
        )

    raw = (response.text or "").strip()

    # Defensive parsing in case model wraps JSON in markdown fences.
    if raw.startswith("```"):
        raw = raw.replace("```json", "").replace("```", "").strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Model returned non-JSON output: {exc}") from exc
    return data


# -----------------------------
# ReAct agent loop
# -----------------------------
def run_react_agent(request: PlanRequest) -> Dict[str, Any]:
    logs: List[Dict[str, str]] = []

    # Step 1: Thought
    logs.append(
        {
            "step": "Thought",
            "content": "I should inspect exam deadlines first to estimate urgency.",
        }
    )

    # Step 2: Action (deadline analyzer)
    logs.append({"step": "Action", "content": "Run Deadline Analyzer Tool"})
    deadline_data = deadline_analyzer_tool(request.subjects)
    logs.append({"step": "Observation", "content": json.dumps(deadline_data)})

    # Step 3: Thought
    logs.append(
        {
            "step": "Thought",
            "content": "Now allocate daily hours by urgency and weak-subject boost.",
        }
    )

    # Step 4: Action (time allocator)
    logs.append({"step": "Action", "content": "Run Study Time Allocator Tool"})
    allocation = study_time_allocator_tool(deadline_data, request.hours_per_day, request.weak_subjects)
    logs.append({"step": "Observation", "content": json.dumps(allocation)})

    # Step 5: Thought
    logs.append(
        {
            "step": "Thought",
            "content": "Use memory and LLM to produce a human-usable final plan.",
        }
    )

    prior = load_last_plan() if request.use_memory else None
    logs.append({"step": "Action", "content": "Use Memory Tool (load previous plan)"})
    logs.append({"step": "Observation", "content": json.dumps(prior) if prior else "No previous plan"})

    # Step 6: Final answer via LLM
    final_plan = call_gemini_for_plan(request, deadline_data, allocation, prior)
    logs.append({"step": "Final Answer", "content": "Generated structured plan using Gemini."})

    result = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "study_plan": final_plan.get("study_plan", []),
        "priority_list": final_plan.get("priority_list", []),
        "time_allocation": final_plan.get("time_allocation", allocation),
        "agent_reasoning_logs": logs,
    }
    if "adjustment_notes" in final_plan:
        result["adjustment_notes"] = final_plan["adjustment_notes"]

    save_last_plan(result)
    return result


# -----------------------------
# API endpoints
# -----------------------------
@app.get("/")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "Agentic AI Academic Planner Backend"}


@app.get("/memory")
def get_memory() -> Dict[str, Any]:
    data = load_last_plan()
    return {"last_plan": data}


@app.post("/upload-syllabus")
async def upload_syllabus(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    pdf_bytes = await file.read()
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded PDF is empty.")

    try:
        extracted_text = extract_text_from_pdf_bytes(pdf_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse PDF: {exc}") from exc

    if not extracted_text:
        raise HTTPException(status_code=400, detail="No readable text found in PDF.")

    # Keep response compact for frontend.
    return {
        "filename": file.filename,
        "characters_extracted": len(extracted_text),
        "syllabus_text": extracted_text[:12000],
    }


@app.post("/plan")
def generate_plan(request: PlanRequest) -> Dict[str, Any]:
    if not request.subjects:
        raise HTTPException(status_code=400, detail="At least one subject is required.")
    return run_react_agent(request)
