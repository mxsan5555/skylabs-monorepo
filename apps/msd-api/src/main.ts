import express from "express";
import * as path from "path";
import swaggerUi from "swagger-ui-express";

import { openApiDocument } from "./config/openapi";

const app = express();

app.use(express.json());

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument)
);

app.use(
  "/assets",
  express.static(path.join(__dirname, "assets"))
);

app.get("/api", (_, res) => {
  res.json({
    message: "Welcome to MySpa Deal API",
  });
});

const port = process.env.PORT || 3333;

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📚 Swagger Docs: http://localhost:${port}/docs`);
});