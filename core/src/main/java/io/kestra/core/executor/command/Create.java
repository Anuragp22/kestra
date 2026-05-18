package io.kestra.core.executor.command;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.kestra.core.debug.Breakpoint;
import io.kestra.core.events.EventId;
import io.kestra.core.models.Label;
import io.kestra.core.models.executions.Execution;
import io.kestra.core.models.executions.ExecutionId;
import io.kestra.core.models.executions.ExecutionKind;
import io.kestra.core.models.executions.ExecutionTrigger;
import io.kestra.core.models.flows.State;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.annotation.Nullable;
import jakarta.validation.constraints.Null;
import lombok.With;

import java.time.Instant;
import java.time.chrono.ChronoZonedDateTime;
import java.util.List;
import java.util.Map;

public record Create(
    ExecutionId executionFullId,
    Instant timestamp,
    EventId eventId,

    @With @Nullable String operationId,
    @With @JsonProperty State.Type stateType,
    @With @JsonProperty ExecutionKind kind,
    @With @JsonProperty @Nullable ExecutionTrigger trigger,
    @With @JsonProperty @Nullable List<Label> labels,
    @With @JsonProperty @Nullable Integer flowRevision,
    @With @JsonProperty @Nullable Instant scheduleDate,
    @With @JsonInclude(JsonInclude.Include.NON_EMPTY) @Nullable @Schema(implementation = Object.class) Map<String, Object> inputs,
    @With @JsonProperty @Nullable List<Breakpoint> breakpoints,
    @With @JsonProperty @Nullable String traceParent
) implements ExecutionCommand {
    public static Create of(ExecutionId executionId) {
        return new Create(
            executionId,
            Instant.now(),
            EventId.create(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null
        );
    }

    @Override
    public String tenantId() {
        return executionFullId().tenantId();
    }

    @Override
    public String namespace() {
        return executionFullId().namespace();
    }

    @Override
    public String flowId() {
        return executionFullId().flowId();
    }

    @Override
    public String executionId() {
        return executionFullId().executionId();
    }
}
