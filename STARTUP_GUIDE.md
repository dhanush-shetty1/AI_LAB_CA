# Academic Planner AI - Complete Startup Guide

## Project Structure
```
AI_LAB_CA/
├── backend/
│   ├── main.py                 # FastAPI backend
│   ├── .env                    # Environment variables (API key)
│   ├── planner_memory.json     # Last saved plan
│   └── start-backend.bat       # Windows startup script
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Main React component
│   │   ├── main.tsx            # Entry point
│   │   └── index.css           # Styles
│   ├── package.json            # Frontend dependencies
│   ├── vite.config.ts          # Vite configuration
│   └── .env                    # API base URL
```

## Prerequisites
- **Python 3.9+** (for backend)
- **Node.js 18+** (for frontend)
- **pip** (Python package manager)
- **npm** (Node package manager)

## Setup Instructions

### 1. Backend Setup

**Windows (Command Prompt):**
```bat
cd AI_LAB_CA\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**Linux/Mac:**
```bash
cd AI_LAB_CA/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Frontend Setup

**Windows (Command Prompt):**
```bat
cd AI_LAB_CA\frontend
npm install
```

**Linux/Mac:**
```bash
cd AI_LAB_CA/frontend
npm install
```

## Running the Application

### Terminal 1: Start Backend
**Windows:**
```bat
cd AI_LAB_CA\backend
.venv\Scripts\activate
python main.py
```
Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### Terminal 2: Start Frontend
**Windows:**
```bat
cd AI_LAB_CA\frontend
npm run dev
```
Expected output:
```
VITE v... ready in ... ms
➜  Local:   http://localhost:5173/
```

### Terminal 3 (Optional): Check Backend Health
**Windows:**
```bat
curl http://127.0.0.1:8000/
```
Should return:
```json
{"status":"ok","service":"Agentic AI Academic Planner Backend"}
```

## Using the Application

1. **Open browser** to `http://localhost:5173/`
2. **Fill in required fields:**
   - Hours / Day: Enter available study hours (e.g., 5)
   - Weak Subjects: Enter subjects (e.g., "Math, Physics")
3. **Add subjects manually OR upload PDFs:**
   - Manual: Enter subject name + exam date
   - PDF: Upload syllabus.pdf and/or timetable.pdf
4. **Click "Generate Study Plan"**
5. **Download CSV** with the generated plan

## Troubleshooting

### Backend Connection Error
**Error:** "Cannot connect to backend at http://127.0.0.1:8000"
**Solution:**
1. Ensure backend is running: `python main.py` in `/backend`
2. Check backend terminal for errors
3. Verify port 8000 is not in use: `netstat -an | findstr :8000` (Windows)

### Missing API Key
**Error:** "Missing GEMINI_API_KEY environment variable"
**Solution:**
1. Check `.env` file exists in `/backend/`
2. Ensure `GEMINI_API_KEY=your_key_here` is set
3. Restart backend after updating `.env`

### PDF Upload Fails
**Error:** "Could not parse PDF"
**Solution:**
1. Ensure PDF is valid and not corrupted
2. Try with a different PDF
3. Check backend console for detailed error

### Frontend Build Errors
**Solution:**
```bash
cd AI_LAB_CA/frontend
npm install
npm run dev
```

## API Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Health check |
| `/memory` | GET | Get last saved plan |
| `/upload-syllabus` | POST | Upload & extract syllabus text |
| `/upload-timetable` | POST | Upload & extract timetable text |
| `/plan` | POST | Generate study plan |

## Environment Variables

### Backend (.env)
```
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

### Frontend (.env)
```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Features

✅ Upload PDF syllabus or enter subjects manually
✅ Set available study hours per day
✅ Mark weak subjects for extra attention
✅ Upload timetable PDF for automatic exam date extraction
✅ AI-powered study plan generation using Gemini
✅ Export plan as CSV
✅ Save plans to local memory

## Support

For issues:
1. Open browser console (F12)
2. Click "Check Backend Status" in app
3. Check backend terminal for error logs
4. Verify all configuration files are set correctly
