import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

// unified-app bundles avatar-01.png..avatar-10.png (unified-app/assets/avatars) -
// keep this list in sync with that folder.
const VALID_AVATAR_KEYS = Array.from({ length: 10 }, (_, i) => `avatar-${String(i + 1).padStart(2, "0")}`);

interface SetAvatarBody {
  avatarKey: string;
}

// <Image> has no cross-platform way to attach an Authorization header
// (react-native-web renders a plain <img>, which can't send one), so this one
// GET alone also accepts the access token as ?token= and promotes it to a
// real Authorization header before running the normal auth chain - everything
// downstream still requires an authenticate + requireSchoolScope pass.
function authenticateFromHeaderOrQuery(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.headers.authorization) {
      const token = (request.query as { token?: string } | undefined)?.token;
      if (token) request.headers.authorization = `Bearer ${token}`;
    }
    await app.authenticate(request, reply);
  };
}

export async function enquiryPhotoRoutes(app: FastifyInstance) {
  // Uploaded photo (camera or gallery) - mutually exclusive with avatarKey.
  app.post<{ Params: { id: string } }>(
    "/enquiries/:id/photo",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "A file is required" } });
      }
      if (!file.mimetype.startsWith("image/")) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Photo must be an image file" } });
      }

      const buffer = await file.toBuffer();
      const key = `${request.schoolId}/photos/${enquiry.id}/${Date.now()}-${file.filename}`;
      const { location } = await storage.save(key, buffer);

      if (enquiry.photoLocation) {
        await storage.remove(enquiry.photoLocation);
      }

      const updated = await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: { photoLocation: location, photoMimeType: file.mimetype, avatarKey: null },
        select: { id: true, photoLocation: true, photoMimeType: true, avatarKey: true },
      });

      return reply.code(201).send({ data: updated, meta: {} });
    }
  );

  // Preset avatar pick - mutually exclusive with an uploaded photo.
  app.patch<{ Params: { id: string }; Body: SetAvatarBody }>(
    "/enquiries/:id/avatar",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const avatarKey = request.body?.avatarKey;
      if (!avatarKey || !VALID_AVATAR_KEYS.includes(avatarKey)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `avatarKey must be one of ${VALID_AVATAR_KEYS.join(", ")}` },
        });
      }

      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }

      if (enquiry.photoLocation) {
        await storage.remove(enquiry.photoLocation);
      }

      const updated = await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: { avatarKey, photoLocation: null, photoMimeType: null },
        select: { id: true, photoLocation: true, photoMimeType: true, avatarKey: true },
      });

      return { data: updated, meta: {} };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/enquiries/:id/photo",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }

      if (enquiry.photoLocation) {
        await storage.remove(enquiry.photoLocation);
      }

      const updated = await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: { photoLocation: null, photoMimeType: null, avatarKey: null },
        select: { id: true, photoLocation: true, photoMimeType: true, avatarKey: true },
      });

      return { data: updated, meta: {} };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/enquiries/:id/photo",
    { onRequest: [authenticateFromHeaderOrQuery(app), app.requireSchoolScope] },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        select: { photoLocation: true, photoMimeType: true },
      });
      if (!enquiry || !enquiry.photoLocation || !enquiry.photoMimeType) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "No photo uploaded for this enquiry" } });
      }

      const buffer = await storage.readBuffer(enquiry.photoLocation);
      reply.type(enquiry.photoMimeType);
      return reply.send(buffer);
    }
  );
}
