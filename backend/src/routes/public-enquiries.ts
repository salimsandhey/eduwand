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

      const academicYear = await prisma.academicYear.findFirst({
        where: { schoolId: school.id, isCurrent: true },
        orderBy: { updatedAt: "desc" },
      });
      if (!academicYear) {
        return reply.code(400).send({
          data: null,
          error: { code: "academic_year_required", message: "This school is not accepting enquiries until a current academic year is set" },
        });
      }

      const enquiry = await prisma.enquiry.create({
        data: {
          schoolId: school.id,
          academicYearId: academicYear.id,
          contactName: body.contactName,
          contactPhone: body.contactPhone,
          contactEmail: body.contactEmail,
          source: "website",
          gradeInterest: body.gradeInterest,
          consentCaptured: true,
          status: "new",
        },
      });

      await prisma.enquiryStageHistory.create({
        data: {
          enquiryId: enquiry.id,
          fromStatus: null,
          toStatus: "new",
          changedByUserId: null,
        },
      });

      if (body.notes && body.notes.trim()) {
        await prisma.enquiryNote.create({
          data: {
            enquiryId: enquiry.id,
            authorUserId: null,
            body: body.notes.trim(),
          },
        });
      }

      return reply.code(201).send({ data: { id: enquiry.id, status: enquiry.status }, meta: {} });
    }
  );
}
