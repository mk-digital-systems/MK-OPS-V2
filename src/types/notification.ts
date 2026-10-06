export type NotificationType =
  | "join_request"
  | "support_reply"
  | "project_delayed"
  | "project_due"
  | "vehicle_deadline"
  | "subscription"
  | "hakedis_unpriced";

/** Durumdan hesaplanan bildirim; key durum değişince değişir. */
export type AppNotification = {
  key: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  at: string;
  read: boolean;
};
