export class JulesService {
  static getInstance(env: any) { return new JulesService(); }
  async startSession(args: any) { return { id: 'dummy-session-id' }; }
}
