'use client';

import * as React from 'react';

export function PlateEditor() {
  return (
    <div className="w-full h-full flex flex-col border border-border rounded-md bg-card">
      <div className="flex justify-start gap-1 p-2 bg-muted/50 border-b border-border">
        <button className="px-3 py-1 hover:bg-muted rounded text-sm font-bold">B</button>
        <button className="px-3 py-1 hover:bg-muted rounded text-sm italic">I</button>
        <button className="px-3 py-1 hover:bg-muted rounded text-sm underline">U</button>
      </div>
      <div className="flex-1 p-8 prose prose-invert max-w-none overflow-y-auto">
        <div className="h-full focus-visible:outline-none placeholder:text-muted-foreground outline-none" contentEditable suppressContentEditableWarning>
          <p>Jane Doe - Senior Software Engineer</p>
          <p>San Francisco, CA | jane.doe@email.com | (555) 123-4567</p>
          <br/>
          <h2>Summary</h2>
          <p>Experienced software engineer with a track record of delivering scalable cloud applications.</p>
        </div>
      </div>
    </div>
  );
}
