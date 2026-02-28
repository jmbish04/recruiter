In worker/ folder

Please replicate what this python script is doing but using only typescript cloudflare worker using cloudflare typescript sdk, continue using browser render api to scan

setup a db using d1 using drizzle schema and drizzle ORM

Create agents using cloudflare agents sdk wrapping openai agents sdk using worker ai inside openai agents sdk via ai gateway to analyze the job postings and create a rating score etc

also agents that will create the resume and cover letters in d1 tables anbd the content will be editable in plate ui react (see below)

the same db schema for company career sites, preferences, etc ... but also include agents for human in the loop to review jobs and the rating that was provided by ai .... the user can provide their own rating for the job overall and or provide ratings on different aspects like location, benefits, salary, etc.

Please use src/frontend for frontend and src/backend for backend ... all code will roll up into a single worker, its just that i would like to keep the code seperate. 

> > This will be data that will be incorporated into the agentic scoring system of future job postings

Use your mcp tool stitch to ask stitch to design a complete shadcn react on astro cloudflare worekr frontend --

- review the companies that have been added to scan jobs from
  --- add or remove companies
  -- review the preferences of jobs and configure them to tailor to the agentic scoring system

-- update my job profile to ensure that im being ranked fairly and accurately

-- human in the loop review process to provide my own rating over jobs

-- resume and cover leter builder -- ability to save multiple working copies per job
-- ability to create sample blocks of language for future resume and cover letters that ai can choose from based on the job its building the resume and cover letter for

==== Plate UI ===

---

title: "React - Plate"
url: "https://platejs.org/docs/installation/react"
date: 2026-02-28

---

# React - Plate

# React

[Previous](/docs/installation/next)[Next](/docs/installation/manual)

Install and configure Plate UI for React

Copy MarkdownOpen

Prerequisites

Before you begin, ensure you have installed and configured [shadcn/ui](https://ui.shadcn.com/docs/installation) (adapted for your framework, e.g., Vite) and [Plate UI](/docs/installation/plate-ui).

This guide walks you through incrementally building a Plate editor in your project.

### [

](#create-your-first-editor)Create Your First Editor

Start by adding the core [Editor](/docs/components/editor) component to your project:

bunnpmpnpm

```
pnpm dlx shadcn@latest add @plate/editor
```

Copy

Next, create a basic editor in your main application file (e.g. `src/App.tsx`). This example sets up a simple editor within an `EditorContainer`.

src/App.tsx

```
import { Plate, usePlateEditor } from 'platejs/react';

import { Editor, EditorContainer } from '@/components/ui/editor';

export default function App() {
  const editor = usePlateEditor(); // Initializes the editor instance

  return (
    <Plate editor={editor}>      {/* Provides editor context */}
      <EditorContainer>         {/* Styles the editor area */}
        <Editor placeholder="Type your amazing content here..." />
      </EditorContainer>
    </Plate>
  );
}
```

`usePlateEditor` creates a memoized editor instance, ensuring stability across re-renders. For a non-memoized version, use `createPlateEditor`.

PreviewCode

﻿Type your amazing content here...

Files

- components
  - installation-next-01-editor-demo.tsx
  - ui
    - editor.tsx
    - editor-static.tsx

components/installation-next-01-editor-demo.tsx

```
'use client';

import { Plate, usePlateEditor } from 'platejs/react';

import { Editor, EditorContainer } from '@/components/ui/editor';

export default function MyEditorPage() {
  const editor = usePlateEditor();

  return (
    <Plate editor={editor}>
      <EditorContainer>
        <Editor placeholder="Type your amazing content here..." />
      </EditorContainer>
    </Plate>
  );
}
```

### [

](#adding-basic-marks)Adding Basic Marks

Enhance your editor with text formatting. Add the **Basic Nodes Kit**, [FixedToolbar](/docs/components/fixed-toolbar) and [MarkToolbarButton](/docs/components/mark-toolbar-button) components:

bunnpmpnpm

```
pnpm dlx shadcn@latest add @plate/basic-nodes-kit @plate/fixed-toolbar @plate/mark-toolbar-button
```

Copy

The `basic-nodes-kit` includes all the basic plugins (bold, italic, underline, headings, blockquotes, etc.) and their components that we'll use in the following steps.

Update your `src/App.tsx` to include these components and the basic mark plugins. This example adds bold, italic, and underline functionality.

src/App.tsx

```
import * as React from 'react';
import type { Value } from 'platejs';

import {
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react';
import {
  Plate,
  usePlateEditor,
} from 'platejs/react';

import { Editor, EditorContainer } from '@/components/ui/editor';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { MarkToolbarButton } from '@/components/ui/mark-toolbar-button';

const initialValue: Value = [
  {
    type: 'p',
    children: [
      { text: 'Hello! Try out the ' },
      { text: 'bold', bold: true },
      { text: ', ' },
      { text: 'italic', italic: true },
      { text: ', and ' },
      { text: 'underline', underline: true },
      { text: ' formatting.' },
    ],
  },
];

export default function App() {
  const editor = usePlateEditor({
    plugins: [BoldPlugin, ItalicPlugin, UnderlinePlugin], // Add the mark plugins
    value: initialValue,         // Set initial content
  });

  return (
    <Plate editor={editor}>
      <FixedToolbar className="justify-start rounded-t-lg">
        <MarkToolbarButton nodeType="bold" tooltip="Bold (⌘+B)">B</MarkToolbarButton>
        <MarkToolbarButton nodeType="italic" tooltip="Italic (⌘+I)">I</MarkToolbarButton>
        <MarkToolbarButton nodeType="underline" tooltip="Underline (⌘+U)">U</MarkToolbarButton>
      </FixedToolbar>
      <EditorContainer>
        <Editor placeholder="Type your amazing content here..." />
      </EditorContainer>
    </Plate>
  );
}
```

PreviewCode

B

I

U

Hello! Try out the **bold**, _italic_, and underline formatting.

Files

- components
  - installation-next-02-marks-demo.tsx
  - ui
    - editor.tsx
    - editor-static.tsx
    - fixed-toolbar.tsx
    - toolbar.tsx
    - mark-toolbar-button.tsx

components/installation-next-02-marks-demo.tsx

Copy

```
'use client';

import * as React from 'react';

import type { Value } from 'platejs';

import {
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react';
import { Plate, usePlateEditor } from 'platejs/react';

import { Editor, EditorContainer } from '@/components/ui/editor';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { MarkToolbarButton } from '@/components/ui/mark-toolbar-button';
// import { Bold, Italic, Underline } from 'lucide-react'; // Example icons

const initialValue: Value = [
  {
    children: [
      { text: 'Hello! Try out the ' },
      { bold: true, text: 'bold' },
      { text: ', ' },
      { italic: true, text: 'italic' },
      { text: ', and ' },
      { text: 'underline', underline: true },
      { text: ' formatting.' },
    ],
    type: 'p',
  },
];

export default function MyEditorPage() {
  const editor = usePlateEditor({
    plugins: [BoldPlugin, ItalicPlugin, UnderlinePlugin],
    value: initialValue,
  });

  return (
    <Plate editor={editor}>
      <FixedToolbar className="justify-start rounded-t-lg">
        <MarkToolbarButton nodeType="bold" tooltip="Bold (⌘+B)">
          B
        </MarkToolbarButton>
        <MarkToolbarButton nodeType="italic" tooltip="Italic (⌘+I)">
          I
        </MarkToolbarButton>
        <MarkToolbarButton nodeType="underline" tooltip="Underline (⌘+U)">
          U
        </MarkToolbarButton>
      </FixedToolbar>

      <EditorContainer>
        <Editor placeholder="Type your amazing content here..." />
      </EditorContainer>
    </Plate>
  );
}
```

### [

](#adding-basic-elements)Adding Basic Elements

Introduce block-level elements like headings and blockquotes with custom components.

src/App.tsx

```
import * as React from 'react';
import type { Value } from 'platejs';

import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react';
import {
  Plate,
  usePlateEditor,
} from 'platejs/react';

import { BlockquoteElement } from '@/components/ui/blockquote-node';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { H1Element, H2Element, H3Element } from '@/components/ui/heading-node';
import { MarkToolbarButton } from '@/components/ui/mark-toolbar-button';
import { ToolbarButton } from '@/components/ui/toolbar'; // Generic toolbar button

const initialValue: Value = [
  {
    children: [{ text: 'Title' }],
    type: 'h3',
  },
  {
    children: [{ text: 'This is a quote.' }],
    type: 'blockquote',
  },
  {
    children: [
      { text: 'With some ' },
      { bold: true, text: 'bold' },
      { text: ' text for emphasis!' },
    ],
    type: 'p',
  },
];

export default function App() {
  const editor = usePlateEditor({
    plugins: [
      BoldPlugin,
      ItalicPlugin,
      UnderlinePlugin,
      H1Plugin.withComponent(H1Element),
      H2Plugin.withComponent(H2Element),
      H3Plugin.withComponent(H3Element),
      BlockquotePlugin.withComponent(BlockquoteElement),
    ],
    value: initialValue,
  });

  return (
    <Plate editor={editor}>
      <FixedToolbar className="flex justify-start gap-1 rounded-t-lg">
        {/* Element Toolbar Buttons */}
        <ToolbarButton onClick={() => editor.tf.h1.toggle()}>H1</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.h2.toggle()}>H2</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.h3.toggle()}>H3</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.blockquote.toggle()}>Quote</ToolbarButton>
        {/* Mark Toolbar Buttons */}
        <MarkToolbarButton nodeType="bold" tooltip="Bold (⌘+B)">B</MarkToolbarButton>
        <MarkToolbarButton nodeType="italic" tooltip="Italic (⌘+I)">I</MarkToolbarButton>
        <MarkToolbarButton nodeType="underline" tooltip="Underline (⌘+U)">U</MarkToolbarButton>
      </FixedToolbar>
      <EditorContainer>
        <Editor placeholder="Type your amazing content here..." />
      </EditorContainer>
    </Plate>
  );
}
```

PreviewCode

H1H2H3Quote

B

I

U

### Title

> This is a quote.

With some **bold** text for emphasis!

Files

- components
  - installation-next-03-elements-demo.tsx
  - ui
    - editor.tsx
    - editor-static.tsx
    - fixed-toolbar.tsx
    - toolbar.tsx
    - mark-toolbar-button.tsx
    - heading-node.tsx
    - heading-node-static.tsx
    - paragraph-node.tsx
    - paragraph-node-static.tsx
    - blockquote-node.tsx
    - blockquote-node-static.tsx

components/installation-next-03-elements-demo.tsx

Copy

```
'use client';

import * as React from 'react';

import type { Value } from 'platejs';

import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react';
import { Plate, usePlateEditor } from 'platejs/react';

import { BlockquoteElement } from '@/components/ui/blockquote-node';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { H1Element, H2Element, H3Element } from '@/components/ui/heading-node';
import { MarkToolbarButton } from '@/components/ui/mark-toolbar-button';
import { ToolbarButton } from '@/components/ui/toolbar';

const initialValue: Value = [
  {
    children: [{ text: 'Title' }],
    type: 'h3',
  },
  {
    children: [{ text: 'This is a quote.' }],
    type: 'blockquote',
  },
  {
    children: [
      { text: 'With some ' },
      { bold: true, text: 'bold' },
      { text: ' text for emphasis!' },
    ],
    type: 'p',
  },
];

export default function MyEditorPage() {
  const editor = usePlateEditor({
    plugins: [
      BoldPlugin,
      ItalicPlugin,
      UnderlinePlugin,
      H1Plugin.withComponent(H1Element),
      H2Plugin.withComponent(H2Element),
      H3Plugin.withComponent(H3Element),
      BlockquotePlugin.withComponent(BlockquoteElement),
    ],
    value: initialValue,
  });

  return (
    <Plate editor={editor}>
      <FixedToolbar className="flex justify-start gap-1 rounded-t-lg">
        <ToolbarButton onClick={() => editor.tf.h1.toggle()}>H1</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.h2.toggle()}>H2</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.h3.toggle()}>H3</ToolbarButton>

        <ToolbarButton onClick={() => editor.tf.blockquote.toggle()}>
          Quote
        </ToolbarButton>

        <MarkToolbarButton nodeType="bold" tooltip="Bold (⌘+B)">
          B
        </MarkToolbarButton>
        <MarkToolbarButton nodeType="italic" tooltip="Italic (⌘+I)">
          I
        </MarkToolbarButton>
        <MarkToolbarButton nodeType="underline" tooltip="Underline (⌘+U)">
          U
        </MarkToolbarButton>
      </FixedToolbar>

      <EditorContainer>
        <Editor placeholder="Type your amazing content here..." />
      </EditorContainer>
    </Plate>
  );
}
```

Component Registration

Notice how we use `Plugin.withComponent(Component)` to register components with their respective plugins. This is the recommended approach for associating React components with Plate plugins.

For a quicker start with common plugins and components pre-configured, use the `editor-basic` block:

bunnpmpnpm

```
pnpm dlx shadcn@latest add @plate/editor-basic
```

Copy

This handles much of the boilerplate for you.

### [

](#handling-editor-value)Handling Editor Value

To make the editor content persistent, let's integrate `localStorage` to save and load the editor's value.

src/App.tsx

```
import * as React from 'react';
import type { Value } from 'platejs';

import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react';
import {
  Plate,
  usePlateEditor,
} from 'platejs/react';

import { BlockquoteElement } from '@/components/ui/blockquote-node';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { H1Element, H2Element, H3Element } from '@/components/ui/heading-node';
import { MarkToolbarButton } from '@/components/ui/mark-toolbar-button';
import { ToolbarButton } from '@/components/ui/toolbar';

const initialValue: Value = [
  {
    children: [{ text: 'Title' }],
    type: 'h3',
  },
  {
    children: [{ text: 'This is a quote.' }],
    type: 'blockquote',
  },
  {
    children: [
      { text: 'With some ' },
      { bold: true, text: 'bold' },
      { text: ' text for emphasis!' },
    ],
    type: 'p',
  },
];

export default function App() {
  const editor = usePlateEditor({
    plugins: [
      BoldPlugin,
      ItalicPlugin,
      UnderlinePlugin,
      H1Plugin.withComponent(H1Element),
      H2Plugin.withComponent(H2Element),
      H3Plugin.withComponent(H3Element),
      BlockquotePlugin.withComponent(BlockquoteElement),
    ],
    value: () => {
      const savedValue = localStorage.getItem('installation-react-demo');
      return savedValue ? JSON.parse(savedValue) : initialValue;
    },
  });

  return (
    <Plate
      editor={editor}
      onChange={({ value }) => {
        localStorage.setItem('installation-react-demo', JSON.stringify(value));
      }}
    >
      <FixedToolbar className="flex justify-start gap-1 rounded-t-lg">
        <ToolbarButton onClick={() => editor.tf.h1.toggle()}>H1</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.h2.toggle()}>H2</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.h3.toggle()}>H3</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.blockquote.toggle()}>Quote</ToolbarButton>
        <MarkToolbarButton nodeType="bold" tooltip="Bold (⌘+B)">B</MarkToolbarButton>
        <MarkToolbarButton nodeType="italic" tooltip="Italic (⌘+I)">I</MarkToolbarButton>
        <MarkToolbarButton nodeType="underline" tooltip="Underline (⌘+U)">U</MarkToolbarButton>
        <div className="flex-1" />
        <ToolbarButton
          className="px-2"
          onClick={() => editor.tf.setValue(initialValue)}
        >
          Reset
        </ToolbarButton>
      </FixedToolbar>
      <EditorContainer>
        <Editor placeholder="Type your amazing content here..." />
      </EditorContainer>
    </Plate>
  );
}
```

PreviewCode

H1H2H3Quote

B

I

U

Reset

### Title

> This is a quote.

With some **bold** text for emphasis!

Files

- components
  - installation-next-04-value-demo.tsx
  - ui
    - editor.tsx
    - editor-static.tsx
    - fixed-toolbar.tsx
    - toolbar.tsx
    - mark-toolbar-button.tsx
    - heading-node.tsx
    - heading-node-static.tsx
    - paragraph-node.tsx
    - paragraph-node-static.tsx
    - blockquote-node.tsx
    - blockquote-node-static.tsx

components/installation-next-04-value-demo.tsx

Copy

```
'use client';

import * as React from 'react';

import type { Value } from 'platejs';

import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react';
import { Plate, usePlateEditor } from 'platejs/react';

import { BlockquoteElement } from '@/components/ui/blockquote-node';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { H1Element, H2Element, H3Element } from '@/components/ui/heading-node';
import { MarkToolbarButton } from '@/components/ui/mark-toolbar-button';
import { ToolbarButton } from '@/components/ui/toolbar';

const initialValue: Value = [
  {
    children: [{ text: 'Title' }],
    type: 'h3',
  },
  {
    children: [{ text: 'This is a quote.' }],
    type: 'blockquote',
  },
  {
    children: [
      { text: 'With some ' },
      { bold: true, text: 'bold' },
      { text: ' text for emphasis!' },
    ],
    type: 'p',
  },
];

export default function MyEditorPage() {
  const editor = usePlateEditor({
    plugins: [
      BoldPlugin,
      ItalicPlugin,
      UnderlinePlugin,
      H1Plugin.withComponent(H1Element),
      H2Plugin.withComponent(H2Element),
      H3Plugin.withComponent(H3Element),
      BlockquotePlugin.withComponent(BlockquoteElement),
    ],
    value: () => {
      const savedValue = localStorage.getItem(
        `nextjs-plate-value-demo-${new Date().toISOString().split('T')[0]}`
      );

      return savedValue ? JSON.parse(savedValue) : initialValue;
    },
  });

  return (
    <Plate
      onChange={({ value }) => {
        localStorage.setItem(
          `nextjs-plate-value-demo-${new Date().toISOString().split('T')[0]}`,
          JSON.stringify(value)
        );
      }}
      editor={editor}
    >
      <FixedToolbar className="flex justify-start gap-1 rounded-t-lg">
        <ToolbarButton onClick={() => editor.tf.h1.toggle()}>H1</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.h2.toggle()}>H2</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.h3.toggle()}>H3</ToolbarButton>

        <ToolbarButton onClick={() => editor.tf.blockquote.toggle()}>
          Quote
        </ToolbarButton>

        <MarkToolbarButton nodeType="bold" tooltip="Bold (⌘+B)">
          B
        </MarkToolbarButton>
        <MarkToolbarButton nodeType="italic" tooltip="Italic (⌘+I)">
          I
        </MarkToolbarButton>
        <MarkToolbarButton nodeType="underline" tooltip="Underline (⌘+U)">
          U
        </MarkToolbarButton>

        <div className="flex-1" />

        <ToolbarButton
          className="px-2"
          onClick={() => {
            editor.tf.setValue(initialValue);
          }}
        >
          Reset
        </ToolbarButton>
      </FixedToolbar>

      <EditorContainer>
        <Editor placeholder="Type your amazing content here..." />
      </EditorContainer>
    </Plate>
  );
}
```

### [

](#next-steps)Next Steps

Congratulations! You've built a foundational Plate editor in your project.

To further enhance your editor:

- **Explore Components:** Discover [Toolbars, Menus, Node components](/docs/components), and more.
- **Add Plugins:** Integrate features like [Tables](/docs/plugins/table), [Mentions](/docs/plugins/mention), [AI](/docs/plugins/ai), or [Markdown](/docs/plugins/markdown).
- **Use Editor Blocks:** Quickly set up pre-configured editors:
  - Basic editor: `npx shadcn@latest add @plate/editor-basic`
  - AI-powered editor: `npx shadcn@latest add @plate/editor-ai`
- **Learn More:**
  - [Editor Configuration](/docs/editor)
  - [Plugin Configuration](/docs/plugin)
  - [Plugin Components](/docs/plugin-components)

[Next.js](/docs/installation/next)[Manual](/docs/installation/manual)

On This Page

[Create Your First Editor](#create-your-first-editor)[Adding Basic Marks](#adding-basic-marks)[Adding Basic Elements](#adding-basic-elements)[Handling Editor Value](#handling-editor-value)[Next Steps](#next-steps)

Build your editor

Production-ready AI template and reusable components.

Get all-access[Get all-access](https://pro.platejs.org)
