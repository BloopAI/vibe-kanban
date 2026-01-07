Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const browserUtils = require('@sentry-internal/browser-utils');

const INTEGRATION_NAME = 'GraphQLClient';

const _graphqlClientIntegration = ((options) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      _updateSpanWithGraphQLData(client, options);
      _updateBreadcrumbWithGraphQLData(client, options);
    },
  };
}) ;

function _updateSpanWithGraphQLData(client, options) {
  client.on('beforeOutgoingRequestSpan', (span, hint) => {
    const spanJSON = core.spanToJSON(span);

    const spanAttributes = spanJSON.data || {};
    const spanOp = spanAttributes[core.SEMANTIC_ATTRIBUTE_SENTRY_OP];

    const isHttpClientSpan = spanOp === 'http.client';

    if (!isHttpClientSpan) {
      return;
    }

    const httpUrl = spanAttributes[core.SEMANTIC_ATTRIBUTE_URL_FULL] || spanAttributes['http.url'];
    const httpMethod = spanAttributes[core.SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD] || spanAttributes['http.method'];

    if (!core.isString(httpUrl) || !core.isString(httpMethod)) {
      return;
    }

    const { endpoints } = options;
    const isTracedGraphqlEndpoint = core.stringMatchesSomePattern(httpUrl, endpoints);
    const payload = getRequestPayloadXhrOrFetch(hint );

    if (isTracedGraphqlEndpoint && payload) {
      const graphqlBody = getGraphQLRequestPayload(payload);

      if (graphqlBody) {
        const operationInfo = _getGraphQLOperation(graphqlBody);
        span.updateName(`${httpMethod} ${httpUrl} (${operationInfo})`);
        span.setAttribute('graphql.document', payload);
      }
    }
  });
}

function _updateBreadcrumbWithGraphQLData(client, options) {
  client.on('beforeOutgoingRequestBreadcrumb', (breadcrumb, handlerData) => {
    const { category, type, data } = breadcrumb;

    const isFetch = category === 'fetch';
    const isXhr = category === 'xhr';
    const isHttpBreadcrumb = type === 'http';

    if (isHttpBreadcrumb && (isFetch || isXhr)) {
      const httpUrl = data?.url;
      const { endpoints } = options;

      const isTracedGraphqlEndpoint = core.stringMatchesSomePattern(httpUrl, endpoints);
      const payload = getRequestPayloadXhrOrFetch(handlerData );

      if (isTracedGraphqlEndpoint && data && payload) {
        const graphqlBody = getGraphQLRequestPayload(payload);

        if (!data.graphql && graphqlBody) {
          const operationInfo = _getGraphQLOperation(graphqlBody);
          data['graphql.document'] = graphqlBody.query;
          data['graphql.operation'] = operationInfo;
        }
      }
    }
  });
}

/**
 * @param requestBody - GraphQL request
 * @returns A formatted version of the request: 'TYPE NAME' or 'TYPE'
 */
function _getGraphQLOperation(requestBody) {
  const { query: graphqlQuery, operationName: graphqlOperationName } = requestBody;

  const { operationName = graphqlOperationName, operationType } = parseGraphQLQuery(graphqlQuery);
  const operationInfo = operationName ? `${operationType} ${operationName}` : `${operationType}`;

  return operationInfo;
}

/**
 * Get the request body/payload based on the shape of the hint.
 *
 * Exported for tests only.
 */
function getRequestPayloadXhrOrFetch(hint) {
  const isXhr = 'xhr' in hint;

  let body;

  if (isXhr) {
    const sentryXhrData = hint.xhr[browserUtils.SENTRY_XHR_DATA_KEY];
    body = sentryXhrData && browserUtils.getBodyString(sentryXhrData.body)[0];
  } else {
    const sentryFetchData = browserUtils.getFetchRequestArgBody(hint.input);
    body = browserUtils.getBodyString(sentryFetchData)[0];
  }

  return body;
}

/**
 * Extract the name and type of the operation from the GraphQL query.
 *
 * Exported for tests only.
 */
function parseGraphQLQuery(query) {
  const namedQueryRe = /^(?:\s*)(query|mutation|subscription)(?:\s*)(\w+)(?:\s*)[{(]/;
  const unnamedQueryRe = /^(?:\s*)(query|mutation|subscription)(?:\s*)[{(]/;

  const namedMatch = query.match(namedQueryRe);
  if (namedMatch) {
    return {
      operationType: namedMatch[1],
      operationName: namedMatch[2],
    };
  }

  const unnamedMatch = query.match(unnamedQueryRe);
  if (unnamedMatch) {
    return {
      operationType: unnamedMatch[1],
      operationName: undefined,
    };
  }
  return {
    operationType: undefined,
    operationName: undefined,
  };
}

/**
 * Extract the payload of a request if it's GraphQL.
 * Exported for tests only.
 * @param payload - A valid JSON string
 * @returns A POJO or undefined
 */
function getGraphQLRequestPayload(payload) {
  let graphqlBody = undefined;
  try {
    const requestBody = JSON.parse(payload) ;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const isGraphQLRequest = !!requestBody['query'];
    if (isGraphQLRequest) {
      graphqlBody = requestBody;
    }
  } finally {
    // Fallback to undefined if payload is an invalid JSON (SyntaxError)

    /* eslint-disable no-unsafe-finally */
    return graphqlBody;
  }
}

/**
 * This integration ensures that GraphQL requests made in the browser
 * have their GraphQL-specific data captured and attached to spans and breadcrumbs.
 */
const graphqlClientIntegration = core.defineIntegration(_graphqlClientIntegration);

exports.getGraphQLRequestPayload = getGraphQLRequestPayload;
exports.getRequestPayloadXhrOrFetch = getRequestPayloadXhrOrFetch;
exports.graphqlClientIntegration = graphqlClientIntegration;
exports.parseGraphQLQuery = parseGraphQLQuery;
//# sourceMappingURL=graphqlClient.js.map
