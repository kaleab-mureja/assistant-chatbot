// src/app/api/upload-pdf/route.ts
import { NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const session_id = formData.get('session_id');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file uploaded or invalid file type' }, { status: 400 });
    }

    const pythonFormData = new FormData();
    pythonFormData.append('file', file);
    if (session_id) {
        pythonFormData.append('session_id', session_id);
    }

    const pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/upload-pdf/`, {
      method: 'POST',
      body: pythonFormData, // Pass FormData directly, headers will be set automatically
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
