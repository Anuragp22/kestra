package io.kestra.core.models.executions;

public record ExecutionId(String tenantId, String namespace, String flowId, String executionId) {
}
