// app/api/upload-pdf/route.ts
import { NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(req: Request) {
  try {
    // We expect a FormData object directly from the client
    const formData = await req.formData();
    
    // The keys must match the FastAPI endpoint: 'session_id' and 'file'
    const sessionId = formData.get('session_id');
    const file = formData.get('file');

    if (!sessionId || !file) {
      return NextResponse.json({ error: 'Missing session_id or file' }, { status: 400 });
    }

    // Pass the FormData object directly to the Python backend
    const pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/upload-pdf/`, {
      method: 'POST',
      body: formData,
    });

    if (!pythonResponse.ok) {
      const errorData = await pythonResponse.json();
      return NextResponse.json(
        { error: errorData.detail || 'Error from Python backend' },
        { status: pythonResponse.status }
      );
    }

    const data = await pythonResponse.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in /api/upload-pdf:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
