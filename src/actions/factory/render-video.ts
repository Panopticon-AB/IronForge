'use server';

import { spawn } from 'node:child_process';

export async function renderVideoAction(props: Record<string, unknown>) {
  try {
    if (!props || typeof props !== 'object') {
      return { success: false, error: 'Valid props object is required' };
    }

    const propsJson = JSON.stringify(props);
    const propsBase64 = Buffer.from(propsJson).toString('base64');

    const scriptPath = [process.cwd(), 'scripts', 'render-video.mjs'].join('/');
    console.log(`[Action] Executing render script at: ${scriptPath}`);

    const child = spawn('node', [scriptPath, propsBase64], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    for await (const chunk of child.stdout) {
      stdout += chunk;
      console.log(`[Render Script STDOUT]: ${chunk}`);
    }
    for await (const chunk of child.stderr) {
      stderr += chunk;
      console.error(`[Render Script STDERR]: ${chunk}`);
    }

    const code = await new Promise((resolve) => {
      child.on('close', resolve);
    });

    if (code !== 0) {
      console.error(`[Action] Render script failed with code ${code}.`);
      return { success: false, error: 'Video rendering failed.', details: stderr };
    }

    const outputPathMatch = stdout.match(/outputPath: (.*)/);
    if (!outputPathMatch) {
      return {
        success: false,
        error: 'Could not determine output path from script.',
        details: stdout,
      };
    }

    return {
      success: true,
      message: 'Video rendered successfully!',
      videoPath: outputPathMatch[1].trim(),
    };
  } catch (error) {
    console.error('[Action] An unexpected error occurred:', error);
    return { success: false, error: 'Internal Server Error' };
  }
}
