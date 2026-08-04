import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";

interface PublicEnquiryBody {
  schoolId: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  gradeInterest?: string;
  notes?: string;
  consentCaptured: boolean;
}

// Open, unauthenticated endpoint for the embeddable public website form (FR-EG-2, FR-EG-10).
// school_id necessarily comes from the request body here (the embed widget is configured
// per school) - this is the one legitimate exception to "never trust a client-supplied
// school_id", since there is no logged-in user/token to derive it from.
export async function publicEnquiryRoutes(app: FastifyInstance) {
  app.post<{ Body: PublicEnquiryBody }>(
    "/public/enquiries",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const body = request.body ?? ({} as PublicEnquiryBody);

      if (!body.schoolId || !body.contactName || !body.contactPhone) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "schoolId, contactName, and contactPhone are required" },
        });
      }

      if (body.consentCaptured !== true) {
        return reply.code(400).send({
          data: null,
          error: { code: "consent_required", message: "Messaging consent must be given to submit this form" },
        });
      }

      const school = await prisma.school.findFirst({ where: { id: body.schoolId, status: "active" } });
      if (!school) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "School not found" } });
      }

      const enquiry = await prisma.enquiry.create({
        data: {
          schoolId: school.id,
          contactName: body.contactName,
          contactPhone: body.contactPhone,
          contactEmail: body.contactEmail,
          source: "website",
          gradeInterest: body.gradeInterest,
          notes: body.notes,
          consentCaptured: true,
          status: "new",
        },
      });

      // System-attributed history entry: there is no authenticated user on a public submission.
      await prisma.enquiryStageHistory.create({
        data: {
          enquiryId: enquiry.id,
          fromStatus: null,
          toStatus: "new",
          changedByUserId: null,
        },
      });

      return reply.code(201).send({ data: { id: enquiry.id, status: enquiry.status }, meta: {} });
    }
  );
}
