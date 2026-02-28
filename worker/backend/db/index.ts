export function getDb(envDb: any) { 
  return { 
    select: (...args: any[]) => ({ from: (...args: any[]) => ({ where: (...args: any[]) => ({ orderBy: (...args: any[]) => ({ limit: (...args: any[]) => [] as any[] }) }) }) }),
    insert: (...args: any[]) => ({ values: async (...args: any[]) => {} })
  }; 
}
