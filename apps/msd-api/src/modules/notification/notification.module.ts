import {
  CreateNotificationSchema,
  UpdateNotificationSchema,
  NotificationParamsSchema,
  NotificationQuerySchema,
  NotificationResponseSchema,
  NotificationListResponseSchema,
  DeleteNotificationResponseSchema,
} from "./notification.schema";

export const notificationModule = {
  tag: "Notification",

  basePath: "/notifications",

  singular: "Notification",

  plural: "Notifications",

  createSchema: CreateNotificationSchema,

  updateSchema: UpdateNotificationSchema,

  paramsSchema: NotificationParamsSchema,

  querySchema: NotificationQuerySchema,

  responseSchema: NotificationResponseSchema,

  listResponseSchema: NotificationListResponseSchema,

  deleteResponseSchema:
    DeleteNotificationResponseSchema,
} as const;