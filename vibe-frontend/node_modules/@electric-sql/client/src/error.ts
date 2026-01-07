export class FetchError extends Error {
  status: number
  text?: string
  json?: object
  headers: Record<string, string>

  constructor(
    status: number,
    text: string | undefined,
    json: object | undefined,
    headers: Record<string, string>,
    public url: string,
    message?: string
  ) {
    super(
      message ||
        `HTTP Error ${status} at ${url}: ${text ?? JSON.stringify(json)}`
    )
    this.name = `FetchError`
    this.status = status
    this.text = text
    this.json = json
    this.headers = headers
  }

  static async fromResponse(
    response: Response,
    url: string
  ): Promise<FetchError> {
    const status = response.status
    const headers = Object.fromEntries([...response.headers.entries()])
    let text: string | undefined = undefined
    let json: object | undefined = undefined

    const contentType = response.headers.get(`content-type`)
    if (!response.bodyUsed) {
      if (contentType && contentType.includes(`application/json`)) {
        json = (await response.json()) as object
      } else {
        text = await response.text()
      }
    }

    return new FetchError(status, text, json, headers, url)
  }
}

export class FetchBackoffAbortError extends Error {
  constructor() {
    super(`Fetch with backoff aborted`)
    this.name = `FetchBackoffAbortError`
  }
}

export class InvalidShapeOptionsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = `InvalidShapeOptionsError`
  }
}

export class MissingShapeUrlError extends Error {
  constructor() {
    super(`Invalid shape options: missing required url parameter`)
    this.name = `MissingShapeUrlError`
  }
}

export class InvalidSignalError extends Error {
  constructor() {
    super(`Invalid signal option. It must be an instance of AbortSignal.`)
    this.name = `InvalidSignalError`
  }
}

export class MissingShapeHandleError extends Error {
  constructor() {
    super(
      `shapeHandle is required if this isn't an initial fetch (i.e. offset > -1)`
    )
    this.name = `MissingShapeHandleError`
  }
}

export class ReservedParamError extends Error {
  constructor(reservedParams: string[]) {
    super(
      `Cannot use reserved Electric parameter names in custom params: ${reservedParams.join(`, `)}`
    )
    this.name = `ReservedParamError`
  }
}

export class ParserNullValueError extends Error {
  constructor(columnName: string) {
    super(`Column "${columnName ?? `unknown`}" does not allow NULL values`)
    this.name = `ParserNullValueError`
  }
}

export class ShapeStreamAlreadyRunningError extends Error {
  constructor() {
    super(`ShapeStream is already running`)
    this.name = `ShapeStreamAlreadyRunningError`
  }
}

export class MissingHeadersError extends Error {
  constructor(url: string, missingHeaders: Array<string>) {
    let msg = `The response for the shape request to ${url} didn't include the following required headers:\n`
    missingHeaders.forEach((h) => {
      msg += `- ${h}\n`
    })
    msg += `\nThis is often due to a proxy not setting CORS correctly so that all Electric headers can be read by the client.`
    msg += `\nFor more information visit the troubleshooting guide: /docs/guides/troubleshooting/missing-headers`
    super(msg)
  }
}
