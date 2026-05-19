package io.kestra.core.models.executions;

import jakarta.annotation.Nullable;

public record ExecutionId(String tenantId, String namespace, String flowId, String executionId, @Nullable Integer flowRevision) {
}
