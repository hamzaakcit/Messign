export type SelectedItem =
  | { type: 'content'; id: string }
  | { type: 'campaign'; id: string }
  | { type: 'lead'; id: string }
  | { type: 'approval'; id: string; contentId: string }
  | null;

export type CockpitAction =
  | { type: 'open_full_page'; path: string }
  | { type: 'edit'; contentId: string };
