export type DoraPipelineErrorCode =
  | 'model_unavailable'
  | 'context_resolution_failed'
  | 'invalid_request'
  | 'tool_execution_failed'
  | 'pipeline_aborted'
  | 'unauthorized'
  | 'internal';

export class DoraPipelineError extends Error {
  readonly code: DoraPipelineErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DoraPipelineErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DoraPipelineError';
    this.code = code;
    this.details = details;
  }
}
