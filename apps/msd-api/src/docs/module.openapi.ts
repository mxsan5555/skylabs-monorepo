import { registry } from "./registry";
import { modules } from "./modules";
import { registerCrudOpenApi } from "./crud.openapi";

modules.forEach((module) => {
  registerCrudOpenApi({
    registry,
    ...module,
  });
});