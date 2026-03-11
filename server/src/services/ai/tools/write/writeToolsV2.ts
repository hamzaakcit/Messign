export const WRITE_TOOLS_V2 = [
  {
    name: 'create_deal',
    description: 'Create a new deal in the Sales CRM pipeline',
    hitl: true,
  },
  {
    name: 'create_ticket',
    description: 'Create a new support ticket',
    hitl: true,
  },
  {
    name: 'assign_asset',
    description: 'Assign an asset or equipment to an employee',
    hitl: true,
  },
  {
    name: 'send_renewal_reminder',
    description: 'Send a renewal reminder for an expiring contract',
    hitl: true,
  },
  {
    name: 'create_campaign',
    description: 'Create a new marketing campaign',
    hitl: true,
  },
  {
    name: 'post_job',
    description: 'Post a new job opening',
    hitl: true,
  },
] as const;

export const EXECUTIVE_TOOLS = [
  {
    name: 'get_executive_dashboard',
    description: 'Get a comprehensive overview of the entire company including revenue, support, marketing, hiring, and team metrics',
  },
  {
    name: 'generate_daily_briefing',
    description: "Generate or retrieve today's personalized daily briefing",
  },
] as const;
