import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";

const VALID_PURPOSES = ["enquiry_intake", "admission_detail", "document_checklist"];
const VALID_FIELD_TYPES = ["text", "number", "date", "select", "multiselect", "checkbox", "textarea", "file"];

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

interface ListQuery {
  purpose?: string;
}

interface CreateFormDefinitionBody {
  purpose: string;
  name: string;
  isActive?: boolean;
}

interface UpdateFormDefinitionBody {
  name?: string;
  isActive?: boolean;
}

interface CreateFieldBody {
  key: string;
  label: string;
  fieldType: string;
  options?: unknown;
  order?: number;
  isRequired?: boolean;
  requiredAtStage?: string | null;
}

interface UpdateFieldBody {
  key?: string;
  label?: string;
  fieldType?: string;
  options?: unknown;
  order?: number;
  isRequired?: boolean;
  requiredAtStage?: string | null;
}

interface ReorderFieldsBody {
  fieldIds: string[];
}

export async function formDefinitionRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    "/form-definitions",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const purpose = request.query.purpose;
      if (!purpose || !VALID_PURPOSES.includes(purpose)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `purpose must be one of ${VALID_PURPOSES.join(", ")}` },
        });
      }

      const definition = await prisma.formDefinition.findFirst({
        where: { schoolId: request.schoolId, purpose, isActive: true },
        include: { fields: { orderBy: { order: "asc" } } },
      });

      if (!definition) {
        return reply.code(404).send({
          data: null,
          error: { code: "not_found", message: `No active ${purpose} form definition for this school` },
        });
      }

      const { fields, ...rest } = definition;
      return { data: { definition: rest, fields }, meta: {} };
    }
  );

  app.post<{ Body: CreateFormDefinitionBody }>(
    "/form-definitions",
    { onRequest: [...scoped(app), requireRoles("admin", "principal")] },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateFormDefinitionBody);

      if (!body.purpose || !body.name) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "purpose and name are required" },
        });
      }

      if (!VALID_PURPOSES.includes(body.purpose)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `purpose must be one of ${VALID_PURPOSES.join(", ")}` },
        });
      }

      const isActive = body.isActive ?? true;

      const definition = await prisma.$transaction(async (tx) => {
        if (isActive) {
          await tx.formDefinition.updateMany({
            where: { schoolId: request.schoolId, purpose: body.purpose, isActive: true },
            data: { isActive: false },
          });
        }
        return tx.formDefinition.create({
          data: {
            schoolId: request.schoolId,
            purpose: body.purpose,
            name: body.name,
            isActive,
            createdBy: request.user.sub,
            updatedBy: request.user.sub,
          },
        });
      });

      return reply.code(201).send({ data: definition, meta: {} });
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateFormDefinitionBody }>(
    "/form-definitions/:id",
    { onRequest: [...scoped(app), requireRoles("admin", "principal")] },
    async (request, reply) => {
      const existing = await prisma.formDefinition.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Form definition not found" } });
      }

      const body = request.body ?? {};
      const activating = body.isActive === true && !existing.isActive;

      const updated = await prisma.$transaction(async (tx) => {
        if (activating) {
          await tx.formDefinition.updateMany({
            where: { schoolId: request.schoolId, purpose: existing.purpose, isActive: true, id: { not: existing.id } },
            data: { isActive: false },
          });
        }
        return tx.formDefinition.update({
          where: { id: existing.id },
          data: {
            name: body.name,
            isActive: body.isActive,
            updatedBy: request.user.sub,
          },
        });
      });

      return { data: updated, meta: {} };
    }
  );

  app.post<{ Params: { id: string }; Body: CreateFieldBody }>(
    "/form-definitions/:id/fields",
    { onRequest: [...scoped(app), requireRoles("admin", "principal")] },
    async (request, reply) => {
      const definition = await prisma.formDefinition.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!definition) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Form definition not found" } });
      }

      const body = request.body ?? ({} as CreateFieldBody);

      if (!body.key || !body.label || !body.fieldType) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "key, label, and fieldType are required" },
        });
      }

      if (!VALID_FIELD_TYPES.includes(body.fieldType)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `fieldType must be one of ${VALID_FIELD_TYPES.join(", ")}` },
        });
      }

      const existingKey = await prisma.formField.findFirst({
        where: { formDefinitionId: definition.id, key: body.key },
      });
      if (existingKey) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `A field with key "${body.key}" already exists on this form` },
        });
      }

      let order = body.order;
      if (order == null) {
        const maxOrder = await prisma.formField.aggregate({
          where: { formDefinitionId: definition.id },
          _max: { order: true },
        });
        order = (maxOrder._max.order ?? 0) + 1;
      }

      const field = await prisma.formField.create({
        data: {
          formDefinitionId: definition.id,
          key: body.key,
          label: body.label,
          fieldType: body.fieldType,
          options: (body.options ?? undefined) as Prisma.InputJsonValue | undefined,
          order,
          isRequired: body.isRequired ?? false,
          requiredAtStage: body.requiredAtStage ?? null,
        },
      });

      return reply.code(201).send({ data: field, meta: {} });
    }
  );

  app.patch<{ Params: { id: string; fieldId: string }; Body: UpdateFieldBody }>(
    "/form-definitions/:id/fields/:fieldId",
    { onRequest: [...scoped(app), requireRoles("admin", "principal")] },
    async (request, reply) => {
      const definition = await prisma.formDefinition.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!definition) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Form definition not found" } });
      }

      const field = await prisma.formField.findFirst({
        where: { id: request.params.fieldId, formDefinitionId: definition.id },
      });
      if (!field) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Field not found" } });
      }

      const body = request.body ?? {};

      if (body.fieldType && !VALID_FIELD_TYPES.includes(body.fieldType)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `fieldType must be one of ${VALID_FIELD_TYPES.join(", ")}` },
        });
      }

      if (body.key && body.key !== field.key) {
        const existingKey = await prisma.formField.findFirst({
          where: { formDefinitionId: definition.id, key: body.key, id: { not: field.id } },
        });
        if (existingKey) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: `A field with key "${body.key}" already exists on this form` },
          });
        }
      }

      const updated = await prisma.formField.update({
        where: { id: field.id },
        data: {
          key: body.key,
          label: body.label,
          fieldType: body.fieldType,
          options: body.options as Prisma.InputJsonValue | undefined,
          order: body.order,
          isRequired: body.isRequired,
          requiredAtStage: body.requiredAtStage,
        },
      });

      return { data: updated, meta: {} };
    }
  );

  app.patch<{ Params: { id: string }; Body: ReorderFieldsBody }>(
    "/form-definitions/:id/fields/reorder",
    { onRequest: [...scoped(app), requireRoles("admin", "principal")] },
    async (request, reply) => {
      const definition = await prisma.formDefinition.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!definition) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Form definition not found" } });
      }

      const fieldIds = request.body?.fieldIds;
      if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "fieldIds must be a non-empty array" },
        });
      }

      const existingFields = await prisma.formField.findMany({
        where: { formDefinitionId: definition.id },
        select: { id: true },
      });
      const existingIds = new Set(existingFields.map((f) => f.id));

      if (fieldIds.length !== existingFields.length || !fieldIds.every((id) => existingIds.has(id))) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "fieldIds must include exactly the fields belonging to this form definition" },
        });
      }

      await prisma.$transaction(
        fieldIds.map((fieldId, index) =>
          prisma.formField.update({ where: { id: fieldId }, data: { order: index + 1 } })
        )
      );

      const fields = await prisma.formField.findMany({
        where: { formDefinitionId: definition.id },
        orderBy: { order: "asc" },
      });

      return { data: fields, meta: {} };
    }
  );

  app.delete<{ Params: { id: string; fieldId: string } }>(
    "/form-definitions/:id/fields/:fieldId",
    { onRequest: [...scoped(app), requireRoles("admin", "principal")] },
    async (request, reply) => {
      const definition = await prisma.formDefinition.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!definition) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Form definition not found" } });
      }

      const field = await prisma.formField.findFirst({
        where: { id: request.params.fieldId, formDefinitionId: definition.id },
      });
      if (!field) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Field not found" } });
      }

      await prisma.formField.delete({ where: { id: field.id } });

      return { data: { id: field.id }, meta: {} };
    }
  );
}
