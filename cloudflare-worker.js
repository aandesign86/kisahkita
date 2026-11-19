export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const gasUrl = env.GAS_WEBAPP_URL;
    if (!gasUrl) {
      return new Response(JSON.stringify({ status: 'error', message: 'GAS_WEBAPP_URL belum diatur di Worker' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const incomingUrl = new URL(request.url);
    const targetUrl = new URL(gasUrl);
    incomingUrl.searchParams.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });

    const fetchOptions = {
      method: request.method,
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' }
    };

    if (request.method === 'POST') {
      fetchOptions.body = await request.text();
    }

    const gasResponse = await fetch(targetUrl.toString(), fetchOptions);
    const bodyText = await gasResponse.text();

    return new Response(bodyText, {
      status: gasResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
  }
};
