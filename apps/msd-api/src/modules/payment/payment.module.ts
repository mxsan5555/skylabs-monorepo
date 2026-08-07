import {
  CreatePaymentSchema,
  UpdatePaymentSchema,
  PaymentParamsSchema,
  PaymentQuerySchema,
  PaymentResponseSchema,
  PaymentListResponseSchema,
  DeletePaymentResponseSchema,
} from "./payment.schema";

export const paymentModule = {
  tag: "Payment",

  basePath: "/payments",

  singular: "Payment",

  plural: "Payments",

  createSchema: CreatePaymentSchema,

  updateSchema: UpdatePaymentSchema,

  paramsSchema: PaymentParamsSchema,

  querySchema: PaymentQuerySchema,

  responseSchema: PaymentResponseSchema,

  listResponseSchema: PaymentListResponseSchema,

  deleteResponseSchema:
    DeletePaymentResponseSchema,
} as const;