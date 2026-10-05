export type SharedNote = {
  id: string;
  title: string;
  note_date: string;
  created_by: string | null;
  created_at: string;
};

export type PrivateNote = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};
