import {
  CreateBookingSchema,
  UpdateBookingSchema,
  BookingParamsSchema,
  BookingQuerySchema,
  BookingResponseSchema,
  BookingListResponseSchema,
  DeleteBookingResponseSchema,
} from "./booking.schema";

export const bookingModule = {
  tag: "Booking",

  basePath: "/bookings",

  singular: "Booking",

  plural: "Bookings",

  createSchema: CreateBookingSchema,

  updateSchema: UpdateBookingSchema,

  paramsSchema: BookingParamsSchema,

  querySchema: BookingQuerySchema,

  responseSchema: BookingResponseSchema,

  listResponseSchema: BookingListResponseSchema,

  deleteResponseSchema:
    DeleteBookingResponseSchema,
} as const;