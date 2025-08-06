// app/api/chat/route.ts

import { NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(req: Request) {
  try {
    const { user_query, session_id } = await req.json();

    const pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/chat/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_query, session_id }),
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
    console.error('Error in /api/chat:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
