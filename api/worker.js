/**
 * Cloudflare Worker — Kingdom Robux + FlevoPay + TikTok Events API
 *
 * ROTAS:
 *
 * POST /api/create-pix
 * GET  /api/status-pix?paymentId=REFERENCE
 * POST /api/tiktok-purchase
 * POST /api/flevopay-webhook
 *
 * CHECKOUT:
 * - Email
 * - Usuário Roblox
 *
 * CPF/documento e telefone NÃO são solicitados no checkout.
 * Eles ficam somente nos Secrets do Cloudflare.
 *
 * SECRETS:
 *
 * FLEVO_API_KEY
 * FLEVO_CUSTOMER_DOCUMENT
 * FLEVO_CUSTOMER_PHONE
 * TIKTOK_ACCESS_TOKEN
 *
 * VARS:
 *
 * FLEVO_BASE_URL
 * FLEVO_POSTBACK_URL
 * ALLOWED_ORIGIN
 * TIKTOK_TEST_EVENT_CODE (opcional)
 *
 * PIXEL TIKTOK:
 * DAQM5MJC77UFPT804HM0
 */

const TIKTOK_PIXEL_ID = "DAQM5MJC77UFPT804HM0";

const TIKTOK_EVENTS_URL =
  "https://business-api.tiktok.com/open_api/v1.2/pixel/track/";

const APPROVED = new Set([
  "APPROVED",
  "PAID",
  "COMPLETED",
  "CONFIRMED",
  "SUCCESS",
  "SUCCEEDED"
]);

/* =========================================================
   CORS
========================================================= */

function getAllowedOrigin(request, env) {
  const configured = String(env.ALLOWED_ORIGIN || "*").trim();

  if (configured === "*") {
    return "*";
  }

  const requestOrigin = request.headers.get("Origin") || "";

  /*
   * Permite uma lista separada por vírgula:
   *
   * https://site.com,https://www.site.com
   */
  const allowed = configured
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (allowed.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowed[0] || "*";
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Webhook-Secret",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}

/* =========================================================
   HELPERS
========================================================= */

function clean(value, max = 300) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function amountInCents(value) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Valor inválido.");
  }

  return Math.round(n * 100);
}

function normalizeStatus(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function extractPix(data) {
  const root = data?.data && typeof data.data === "object" ? data.data : data;
  const payment = root?.payment && typeof root.payment === "object" ? root.payment : root;

  return {
    copyPaste:
      payment?.qr_code ||
      payment?.qrCode ||
      payment?.pix_code ||
      payment?.copy_paste ||
      payment?.copyPaste ||
      root?.qr_code ||
      root?.qrCode ||
      root?.pix_code ||
      root?.copy_paste ||
      root?.copyPaste ||
      "",

    qrCodeBase64:
      payment?.qr_code_base64 ||
      payment?.qrCodeBase64 ||
      root?.qr_code_base64 ||
      root?.qrCodeBase64 ||
      "",

    qrCodeUrl:
      payment?.qrcodeUrl ||
      payment?.qrCodeUrl ||
      payment?.qr_url ||
      root?.qrcodeUrl ||
      root?.qrCodeUrl ||
      root?.qr_url ||
      "",

    paymentId:
      payment?.transaction_id ??
      payment?.transactionId ??
      payment?.id ??
      payment?.external_id ??
      root?.transaction_id ??
      root?.transactionId ??
      root?.id ??
      root?.external_id ??
      ""
  };
}

function getUrl(env, path) {
  const base = clean(
    env.FLEVO_BASE_URL ||
      "https://app.flevopay.com.br"
  ).replace(/\/+$/, "");

  return `${base}${
    path.startsWith("/") ? path : `/${path}`
  }`;
}

/* =========================================================
   FLEVO API
========================================================= */

async function flevoFetch(env, path, init = {}) {
  if (!env.FLEVO_API_KEY) {
    throw new Error(
      "FLEVO_API_KEY não configurada."
    );
  }

  const headers = new Headers(init.headers || {});

  headers.set(
    "X-API-Key",
    env.FLEVO_API_KEY
  );

  headers.set(
    "Accept",
    "application/json"
  );

  if (
    init.body &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json"
    );
  }

  return fetch(
    getUrl(env, path),
    {
      ...init,
      headers
    }
  );
}

/* =========================================================
   CREATE PIX
========================================================= */

async function createPix(
  request,
  env,
  origin
) {
  const body =
    await request
      .json()
      .catch(() => null);

  if (
    !body ||
    typeof body !== "object"
  ) {
    return json(
      {
        success: false,
        message: "JSON inválido."
      },
      400,
      origin
    );
  }

  const email = clean(
    body.email,
    254
  ).toLowerCase();

  const username = clean(
    body.username ||
      body.robloxUsername ||
      body.user,
    100
  );

  const amount = Number(
    body.amount
  );

  /* -----------------------------------------
     EMAIL
  ----------------------------------------- */

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    return json(
      {
        success: false,
        message: "E-mail inválido."
      },
      400,
      origin
    );
  }

  /* -----------------------------------------
     ROBLOX USERNAME
  ----------------------------------------- */

  if (!username) {
    return json(
      {
        success: false,
        message:
          "Usuário Roblox obrigatório."
      },
      400,
      origin
    );
  }

  /* -----------------------------------------
     VALOR
  ----------------------------------------- */

  let cents;

  try {
    cents = amountInCents(amount);
  } catch {
    return json(
      {
        success: false,
        message: "Valor inválido."
      },
      400,
      origin
    );
  }

  /* -----------------------------------------
     REFERÊNCIA
  ----------------------------------------- */

  const reference =
    clean(
      body.externalReference,
      120
    ) ||
    `KING-${crypto.randomUUID()}`;

  /* -----------------------------------------
     DOCUMENTO E TELEFONE
     
     NÃO vêm do navegador.
     
     Ficam nos Secrets:
     
     FLEVO_CUSTOMER_DOCUMENT
     FLEVO_CUSTOMER_PHONE
  ----------------------------------------- */

  const document = clean(
    env.FLEVO_CUSTOMER_DOCUMENT,
    30
  );

  const phone = clean(
    env.FLEVO_CUSTOMER_PHONE,
    30
  );

  if (!document) {
    return json(
      {
        success: false,
        code:
          "FLEVO_CUSTOMER_DOCUMENT_MISSING",
        message:
          "Configure o Secret FLEVO_CUSTOMER_DOCUMENT no Worker."
      },
      500,
      origin
    );
  }

  if (!phone) {
    return json(
      {
        success: false,
        code:
          "FLEVO_CUSTOMER_PHONE_MISSING",
        message:
          "Configure o Secret FLEVO_CUSTOMER_PHONE no Worker."
      },
      500,
      origin
    );
  }

  /* -----------------------------------------
     PAYLOAD FLEVOPAY
  ----------------------------------------- */

  const payload = {
    amount: cents,

    description: clean(
      body.description ||
        body.product ||
        "Compra Robux",
      200
    ),

    reference,

    /*
     * Quando source = api_externa,
     * não dependemos de productHash.
     */
    source: "api_externa",

    customer: {
      name: username,
      email: email,

      /*
       * IMPORTANTE:
       * Este campo resolve o erro:
       *
       * Campo obrigatório ausente em
       * 'customer': document
       */
      document: document,

      phone: phone
    }
  };

  /* -----------------------------------------
     POSTBACK OPCIONAL
  ----------------------------------------- */

  if (
    env.FLEVO_POSTBACK_URL
  ) {
    payload.postback_url =
      env.FLEVO_POSTBACK_URL;
  }

  /* -----------------------------------------
     ENVIA PARA FLEVOPAY
  ----------------------------------------- */

  const upstream =
    await flevoFetch(
      env,
      "/api/v1/transaction",
      {
        method: "POST",

        headers: {
          "Idempotency-Key":
            reference
        },

        body:
          JSON.stringify(payload)
      }
    );

  const raw =
    await upstream.text();

  let data = {};

  try {
    data = raw
      ? JSON.parse(raw)
      : {};
  } catch {
    data = {
      raw
    };
  }

  /* -----------------------------------------
     ERRO DA FLEVOPAY
  ----------------------------------------- */

  if (
    !upstream.ok ||
    data?.status === "error"
  ) {
    return json(
      {
        success: false,

        message:
          data?.message ||
          data?.error ||
          "A FlevoPay recusou a criação do PIX.",

        providerStatus:
          upstream.status,

        provider: data
      },
      502,
      origin
    );
  }

  /* -----------------------------------------
     EXTRAI PIX
  ----------------------------------------- */

  const pix =
    extractPix(data);

  /*
   * Usamos a reference como paymentId.
   *
   * O status será consultado usando:
   *
   * external_id = reference
   */

  return json(
    {
      success: true,

      paymentId:
        reference,

      reference,

      transactionId:
        data?.transaction_id ??
        null,

      copyPaste:
        pix.copyPaste,

      pixCode:
        pix.copyPaste,

      qrCodeBase64:
        pix.qrCodeBase64,

      qr_code_base64:
        pix.qrCodeBase64,

      qrcodeUrl:
        pix.qrCodeUrl || "",

      qrCodeUrl:
        pix.qrCodeUrl || "",

      status:
        normalizeStatus(
          data?.status
        ) || "PENDING",

      expiresAt:
        data?.expires_at ??
        null
    },
    200,
    origin
  );
}

/* =========================================================
   BUSCA TRANSAÇÃO NA FLEVOPAY
========================================================= */

async function findTransaction(
  env,
  reference
) {
  const path =
    `/api/v1/query?action=list_transactions&external_id=${encodeURIComponent(
      reference
    )}`;

  const upstream =
    await flevoFetch(
      env,
      path,
      {
        method: "GET"
      }
    );

  const raw =
    await upstream.text();

  let data = {};

  try {
    data = raw
      ? JSON.parse(raw)
      : {};
  } catch {
    data = {};
  }

  if (!upstream.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        "Não foi possível consultar a transação na FlevoPay."
    );
  }

  const transactions =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : data
          ? [data]
          : [];

  const transaction =
    transactions.find(
      (item) =>
        clean(item?.external_id) === reference ||
        clean(item?.externalId) === reference ||
        clean(item?.external_reference) === reference ||
        clean(item?.externalReference) === reference ||
        clean(item?.reference) === reference ||
        clean(item?.id) === reference
    ) ||
    transactions[0] ||
    null;

  return transaction;
}

/* =========================================================
   STATUS PIX
========================================================= */

async function statusPix(
  request,
  env,
  origin
) {
  const url =
    new URL(request.url);

  const reference =
    clean(
      url.searchParams.get(
        "paymentId"
      ) ||

      url.searchParams.get(
        "reference"
      ) ||

      url.searchParams.get(
        "external_id"
      ),
      160
    );

  if (!reference) {
    return json(
      {
        success: false,
        message:
          "paymentId/reference obrigatório."
      },
      400,
      origin
    );
  }

  let transaction;

  try {
    transaction =
      await findTransaction(
        env,
        reference
      );
  } catch (error) {
    return json(
      {
        success: false,

        message:
          error?.message ||
          "Não foi possível consultar o pagamento."
      },
      502,
      origin
    );
  }

  if (!transaction) {
    return json(
      {
        success: true,

        paymentId:
          reference,

        status:
          "NOT_FOUND",

        paid: false,

        provider: []
      },
      200,
      origin
    );
  }

  const status =
    normalizeStatus(
      transaction?.status ||
      transaction?.payment_status ||
      transaction?.paymentStatus ||
      transaction?.state ||
      transaction?.data?.status
    );

  const paid =
    APPROVED.has(status);

  return json(
    {
      success: true,

      paymentId:
        reference,

      reference,

      transactionId:
        transaction?.id ??
        null,

      status,

      paid,

      provider:
        transaction
    },
    200,
    origin
  );
}

/* =========================================================
   SHA-256
========================================================= */

async function sha256(value) {
  const data =
    new TextEncoder().encode(
      String(value || "")
        .trim()
        .toLowerCase()
    );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array.from(
    new Uint8Array(hash)
  )
    .map((b) =>
      b.toString(16).padStart(2, "0")
    )
    .join("");
}

/* =========================================================
   TIKTOK EVENTS API
========================================================= */

async function sendTikTokCompletePayment(
  request,
  env,
  {
    eventId,
    paymentId,
    email,
    value,
    currency,
    contentId,
    contentName,
    contentType,
    pageUrl,
    referrer
  }
) {
  if (
    !env.TIKTOK_ACCESS_TOKEN
  ) {
    throw new Error(
      "TIKTOK_ACCESS_TOKEN não configurado."
    );
  }

  if (!eventId) {
    throw new Error(
      "event_id obrigatório."
    );
  }

  if (!paymentId) {
    throw new Error(
      "paymentId obrigatório."
    );
  }

  /*
   * O Worker NÃO confia apenas no navegador.
   *
   * Antes de mandar a conversão ao TikTok,
   * confirma a transação diretamente na FlevoPay.
   */

  const transaction =
    await findTransaction(
      env,
      paymentId
    );

  if (!transaction) {
    return {
      sent: false,
      reason:
        "TRANSACTION_NOT_FOUND"
    };
  }

  const paymentStatus =
    normalizeStatus(
      transaction.status
    );

  if (
    !APPROVED.has(
      paymentStatus
    )
  ) {
    return {
      sent: false,

      reason:
        "PAYMENT_NOT_APPROVED",

      status:
        paymentStatus
    };
  }

  const numericValue =
    Number(value);

  if (
    !Number.isFinite(
      numericValue
    ) ||
    numericValue <= 0
  ) {
    throw new Error(
      "Valor inválido para TikTok."
    );
  }

  /* -----------------------------------------
     HASH DO EMAIL
  ----------------------------------------- */

  const hashedEmail =
    email
      ? await sha256(email)
      : "";

  /* -----------------------------------------
     IP / USER AGENT
  ----------------------------------------- */

  const ip =
    request.headers.get(
      "CF-Connecting-IP"
    ) || "";

  const userAgent =
    request.headers.get(
      "User-Agent"
    ) || "";

  /* -----------------------------------------
     PAYLOAD TIKTOK
  ----------------------------------------- */

  const payload = {
    pixel_code:
      TIKTOK_PIXEL_ID,

    event:
      "CompletePayment",

    /*
     * IMPORTANTE:
     *
     * O MESMO event_id é enviado pelo
     * navegador e pelo servidor.
     *
     * Isso permite deduplicação.
     */
    event_id:
      eventId,

    /*
     * TikTok aceita timestamp ISO.
     */
    timestamp:
      new Date().toISOString(),

    context: {
      page: {
        url:
          clean(
            pageUrl,
            2000
          ),

        referrer:
          clean(
            referrer,
            2000
          )
      },

      user: {
        ...(hashedEmail
          ? {
              email:
                hashedEmail
            }
          : {})
      },

      ip:
        ip,

      user_agent:
        userAgent
    },

    properties: {
      currency:
        clean(
          currency || "BRL",
          10
        ),

      value:
        Number(
          numericValue.toFixed(2)
        ),

      contents: [
        {
          content_id:
            clean(
              contentId,
              100
            ),

          content_name:
            clean(
              contentName,
              200
            ),

          content_type:
            clean(
              contentType ||
                "product",
              50
            ),

          quantity: 1,

          price:
            Number(
              numericValue.toFixed(2)
            )
        }
      ],

      order_id:
        clean(
          paymentId,
          160
        )
    }
  };

  /*
   * Código de teste do TikTok é opcional.
   *
   * Configure TIKTOK_TEST_EVENT_CODE
   * somente enquanto estiver testando.
   */

  if (
    env.TIKTOK_TEST_EVENT_CODE
  ) {
    payload.test_event_code =
      clean(
        env.TIKTOK_TEST_EVENT_CODE,
        100
      );
  }

  /* -----------------------------------------
     ENVIA PARA TIKTOK
  ----------------------------------------- */

  const response =
    await fetch(
      TIKTOK_EVENTS_URL,
      {
        method: "POST",

        headers: {
          "Access-Token":
            env.TIKTOK_ACCESS_TOKEN,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(
            payload
          )
      }
    );

  const raw =
    await response.text();

  let data = {};

  try {
    data = raw
      ? JSON.parse(raw)
      : {};
  } catch {
    data = {
      raw
    };
  }

  if (!response.ok) {
    throw new Error(
      `TikTok HTTP ${response.status}: ${
        data?.message ||
        data?.error ||
        raw ||
        "erro desconhecido"
      }`
    );
  }

  return {
    sent: true,

    status:
      response.status,

    paymentStatus,

    tiktok:
      data
  };
}

/* =========================================================
   TIKTOK PURCHASE ENDPOINT
========================================================= */

async function tiktokPurchase(
  request,
  env,
  origin
) {
  const body =
    await request
      .json()
      .catch(() => null);

  if (
    !body ||
    typeof body !== "object"
  ) {
    return json(
      {
        success: false,
        message:
          "JSON inválido."
      },
      400,
      origin
    );
  }

  const eventId =
    clean(
      body.event_id,
      200
    );

  const paymentId =
    clean(
      body.paymentId ||
        body.order_id,
      160
    );

  const email =
    clean(
      body.email,
      254
    ).toLowerCase();

  const value =
    Number(body.value);

  const currency =
    clean(
      body.currency ||
        "BRL",
      10
    );

  const contentId =
    clean(
      body.content_id,
      100
    );

  const contentName =
    clean(
      body.content_name,
      200
    );

  const contentType =
    clean(
      body.content_type ||
        "product",
      50
    );

  const pageUrl =
    clean(
      body.page_url,
      2000
    ) ||
    request.headers.get(
      "Referer"
    ) ||
    "";

  const referrer =
    clean(
      body.referrer,
      2000
    );

  if (!eventId) {
    return json(
      {
        success: false,
        message:
          "event_id obrigatório."
      },
      400,
      origin
    );
  }

  if (!paymentId) {
    return json(
      {
        success: false,
        message:
          "paymentId obrigatório."
      },
      400,
      origin
    );
  }

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return json(
      {
        success: false,
        message:
          "value inválido."
      },
      400,
      origin
    );
  }

  try {
    const result =
      await sendTikTokCompletePayment(
        request,
        env,
        {
          eventId,
          paymentId,
          email,
          value,
          currency,
          contentId,
          contentName,
          contentType,
          pageUrl,
          referrer
        }
      );

    return json(
      {
        success: true,
        ...result
      },
      200,
      origin
    );
  } catch (error) {
    return json(
      {
        success: false,

        message:
          error?.message ||
          "Erro ao enviar evento ao TikTok."
      },
      502,
      origin
    );
  }
}

/* =========================================================
   WEBHOOK FLEVOPAY
========================================================= */

async function webhook(
  request,
  env,
  origin
) {
  const expected =
    clean(
      env.WEBHOOK_SECRET
    );

  if (expected) {
    const received =
      request.headers.get(
        "X-Webhook-Secret"
      ) || "";

    if (
      received !== expected
    ) {
      return json(
        {
          success: false,
          message:
            "Webhook não autorizado."
        },
        401,
        origin
      );
    }
  }

  const body =
    await request
      .json()
      .catch(() => ({}));

  return json(
    {
      success: true,

      received: true,

      status:
        normalizeStatus(
          body?.status
        )
    },
    200,
    origin
  );
}

/* =========================================================
   MAIN
========================================================= */

export default {
  async fetch(
    request,
    env
  ) {
    const origin =
      getAllowedOrigin(
        request,
        env
      );

    /* -----------------------------------------
       OPTIONS / CORS
    ----------------------------------------- */

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,

          headers:
            corsHeaders(
              origin
            )
        }
      );
    }

    const url =
      new URL(
        request.url
      );

    try {
      /* ---------------------------------------
         CREATE PIX
      --------------------------------------- */

      if (
        request.method ===
          "POST" &&
        url.pathname ===
          "/api/create-pix"
      ) {
        return await createPix(
          request,
          env,
          origin
        );
      }

      /* ---------------------------------------
         STATUS PIX
      --------------------------------------- */

      if (
        request.method ===
          "GET" &&
        url.pathname ===
          "/api/status-pix"
      ) {
        return await statusPix(
          request,
          env,
          origin
        );
      }

      /* ---------------------------------------
         TIKTOK COMPLETE PAYMENT
      --------------------------------------- */

      if (
        request.method ===
          "POST" &&
        url.pathname ===
          "/api/tiktok-purchase"
      ) {
        return await tiktokPurchase(
          request,
          env,
          origin
        );
      }

      /* ---------------------------------------
         FLEVOPAY WEBHOOK
      --------------------------------------- */

      if (
        request.method ===
          "POST" &&
        url.pathname ===
          "/api/flevopay-webhook"
      ) {
        return await webhook(
          request,
          env,
          origin
        );
      }

      /* ---------------------------------------
         NOT FOUND
      --------------------------------------- */

      return json(
        {
          success: false,
          message:
            "Not found."
        },
        404,
        origin
      );
    } catch (error) {
      return json(
        {
          success: false,

          message:
            error?.message ||
            "Erro interno do Worker."
        },
        500,
        origin
      );
    }
  }
};