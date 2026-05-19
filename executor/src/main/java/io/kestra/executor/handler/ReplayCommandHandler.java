package io.kestra.executor.handler;

import java.util.Optional;

import io.kestra.core.async.AsyncOperationProcessedEvent;
import io.kestra.core.async.AsyncOperationService;
import io.kestra.core.exceptions.FlowNotFoundException;
import io.kestra.core.executor.command.Replay;
import io.kestra.core.models.flows.Flow;
import io.kestra.core.runners.ExecutionEvent;
import io.kestra.core.runners.ExecutionEventType;
import io.kestra.core.runners.FlowMetaStoreInterface;
import io.kestra.core.services.ExecutionService;
import io.kestra.executor.ExecutionStateStore;
import io.kestra.executor.ExecutorContext;

import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import lombok.extern.slf4j.Slf4j;

@Singleton
@Slf4j
public class ReplayCommandHandler {

    private final FlowMetaStoreInterface flowMetaStore;
    private final ExecutionService executionService;
    private final ExecutionStateStore executionStateStore;
    private final ExecutionEventMessageHandler executionEventMessageHandler;
    private final AsyncOperationService asyncOperationService;

    @Inject
    public ReplayCommandHandler(
        FlowMetaStoreInterface flowMetaStore,
        ExecutionService executionService,
        ExecutionStateStore executionStateStore,
        ExecutionEventMessageHandler executionEventMessageHandler,
        AsyncOperationService asyncOperationService) {
        this.flowMetaStore = flowMetaStore;
        this.executionService = executionService;
        this.executionStateStore = executionStateStore;
        this.executionEventMessageHandler = executionEventMessageHandler;
        this.asyncOperationService = asyncOperationService;
    }

    public Optional<ExecutorContext> handle(Replay command) {
        AsyncOperationProcessedEvent.Outcome outcome = AsyncOperationProcessedEvent.Outcome.SUCCEEDED;
        String error = null;
        try {
            var raw = executionStateStore.findById(command.sourceExecutionId());
            if (raw == null) {
                throw new IllegalStateException("Source execution not found: " + command.sourceExecutionId());
            }

            // Apply inputs override if the controller merged new inputs before emitting the command
            final var sourceExecution = command.inputs() != null ? raw.withInputs(command.inputs()) : raw;

            // findByExecutionThenInjectDefaults returns FlowWithSource (a Flow subtype);
            // findById returns FlowInterface — cast is safe since all concrete implementations return Flow.
            Flow flow;
            if (command.revision() != null) {
                flow = (Flow) flowMetaStore
                    .findById(command.tenantId(), command.namespace(), command.flowId(), Optional.of(command.revision()))
                    .orElseThrow(() -> new FlowNotFoundException(sourceExecution));
            } else {
                flow = flowMetaStore
                    .findByExecutionThenInjectDefaults(sourceExecution)
                    .orElseThrow(() -> new FlowNotFoundException(sourceExecution));
            }

            var newExecution = executionService.replay(
                sourceExecution,
                flow,
                command.taskRunId(),
                command.revision(),
                Optional.ofNullable(command.breakpoints()),
                true,
                command.executionId()
            );

            executionStateStore.create(newExecution);

            return executionEventMessageHandler.handle(new ExecutionEvent(newExecution, ExecutionEventType.CREATED));
        } catch (Exception e) {
            log.error("Unable to process Replay command for new execution {}: ignoring command with eventId {}",
                command.executionId(), command.eventId(), e);
            outcome = AsyncOperationProcessedEvent.Outcome.FAILED;
            error = e.getMessage();
            return Optional.empty();
        } finally {
            asyncOperationService.emitProcessedIfAsync(command, command.tenantId(), command.executionId(), outcome, error);
        }
    }
}
