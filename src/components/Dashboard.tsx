import React, { useEffect, useState } from 'react';

export function Dashboard() {
  const [prefs, setPrefs] = useState<any>(null);

  useEffect(() => {
    fetch('/api/preferences')
      .then(r => r.json())
      .then(data => setPrefs(data))
      .catch(console.error);
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">AI Job Scraper Platform</h1>

      <div className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="flex flex-col space-y-1.5 p-6 border-b border-border">
          <h3 className="font-semibold leading-none tracking-tight">Active Configuration</h3>
        </div>
        <div className="p-6">
          {prefs ? (
            <div className="space-y-4">
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Candidate Profile:</span>
                <p className="text-sm font-medium">{prefs.candidateProfile || "Not Set"}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Target Minimum Relevancy Score:</span>
                <div className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-10 px-4 py-2">
                  {prefs.minScore || 80} / 100
                </div>
              </div>
            </div>
          ) : (
             <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-4 py-1">
                <div className="h-2 bg-muted rounded w-3/4"></div>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="h-2 bg-muted rounded col-span-2"></div>
                    <div className="h-2 bg-muted rounded col-span-1"></div>
                  </div>
                  <div className="h-2 bg-muted rounded w-1/4"></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
