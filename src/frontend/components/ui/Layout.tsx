import React from 'react';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-card border-r border-border min-h-screen p-4 flex flex-col">
        <div className="font-bold text-xl mb-8 tracking-tighter">Job Scraper platform</div>
        <nav className="space-y-2 flex-1">
          <a href="/companies" className="block px-4 py-2 hover:bg-muted rounded-md transition-colors">Companies</a>
          <a href="/preferences" className="block px-4 py-2 hover:bg-muted rounded-md transition-colors">Preferences</a>
          <a href="/profile" className="block px-4 py-2 hover:bg-muted rounded-md transition-colors">Job Profile</a>
          <a href="/review" className="block px-4 py-2 hover:bg-muted rounded-md transition-colors">Job Review</a>
          <a href="/resumes" className="block px-4 py-2 hover:bg-muted rounded-md transition-colors">Resumes & Letters</a>
          <a href="/snippets" className="block px-4 py-2 hover:bg-muted rounded-md transition-colors">Snippets</a>
        </nav>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
