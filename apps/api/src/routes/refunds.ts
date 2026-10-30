import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { toFils } from "@filspay/money";
import {
  requireMerchantAuth,
  requireMerchantRole,
  requireMerchantWriterActor,
} from "../auth/requireMerchantAuth.js";
import { assertRefundRequestScope, initiateMerchantRefund } from "../refunds/initiateMerchantRefund.js";
import { BadRequestError } from "../lib/errors.js";

/**
 * Refunds (FP-300): POST /v1/refunds (merchant from the credential) and
 * POST /v1/merchants/:merchantId/refunds (dashboard). Owner/finance only.
 * The Idempotency-Key must come from the client; a key made on the server
 * would turn every retry into a second refund.
 */

interface RefundBody {
  transactionId?: unknown;
  amountFils?: unknown;
  reason?: unknown;
}

interface MerchantIdParams {
  merchantId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON_LENGTH = 500;

function getIdempotencyKey(request: FastifyRequest): string {
  const header = request.headers["idempotency-key"];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key) {
    throw new BadRequestError("idempotency_key_required", "Idempotency-Key header is required");
  }
  return key;
}

function parseRefundBody(body: RefundBody | undefined) {
  const { transactionId, amountFils, reason } = body ?? {};
  if (typeof transactionId !== "string" || !UUID_RE.test(transactionId)) {
    throw new BadRequestError("invalid_request", "transactionId must be a transaction id");
  }
  // Integer fils only (ADR-0001). Omitted = everything still refundable.
  if (amountFils !== undefined && (typeof amountFils !== "number" || !Number.isSafeInteger(amountFils) || amountFils <= 0)) {
    throw new BadRequestError("invalid_amount", "amountFils must be a positive integer number of fils");
  }
  if (reason !== undefined && (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH)) {
    throw new BadRequestError("invalid_request", `reason must be a string of at most ${MAX_REASON_LENGTH} characters`);
  }
  return {
    transactionId,
    amountFils: amountFils === undefined ? undefined : toFils(amountFils as number),
    reason: reason as string | undefined,
  };
}

async function handleRefund(
  app: FastifyInstance,
  request: FastifyRequest<{ Body: RefundBody }>,
  reply: FastifyReply,
  merchantId: string,
): Promise<void> {
  const idempotencyKey = getIdempotencyKey(request);
  const body = parseRefundBody(request.body);
  const result = await initiateMerchantRefund(app.db, app.acquirer, {
    merchantId,
    transactionId: body.transactionId,
    amountFils: body.amountFils,
    reason: body.reason,
    idempotencyKey,
    actor: requireMerchantWriterActor(request.merchantAuth!),
  });
  reply.code(result.statusCode).send(result.body);
}

/** Registered with prefix '/v1/refunds'. */
export async function refundRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RefundBody }>(
    "/",
    { preHandler: [requireMerchantAuth, requireMerchantRole("owner", "finance")] },
    async (request, reply) => handleRefund(app, request, reply, request.merchantAuth!.merchantId),
  );
}

/** Registered with prefix '/v1/merchants'. */
export async function merchantRefundRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: MerchantIdParams; Body: RefundBody }>(
    "/:merchantId/refunds",
    { preHandler: [requireMerchantAuth, requireMerchantRole("owner", "finance")] },
    async (request, reply) => {
      assertRefundRequestScope(request.merchantAuth!, request.params.merchantId);
      await handleRefund(app, request, reply, request.params.merchantId);
    },
  );
}
