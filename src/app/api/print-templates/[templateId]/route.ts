import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const TEMPLATE_ID_PATTERN = /^[a-z0-9-]+$/;

function templatePath(templateId: string): string {
  return path.join(process.cwd(), 'src/print-templates/html', `${templateId}.html`);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await context.params;
    const id = (templateId || '').trim();

    if (!id || !TEMPLATE_ID_PATTERN.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid template id' },
        { status: 400 }
      );
    }

    const filePath = templatePath(id);
    const html = await fs.readFile(filePath, 'utf8');

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return NextResponse.json(
        { success: false, error: 'Print template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load print template',
      },
      { status: 500 }
    );
  }
}
