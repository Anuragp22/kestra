package io.kestra.executor.handler;

import java.util.Optional;

import io.kestra.core.async.AsyncOperationProcessedEvent;
import io.kestra.core.async.AsyncOperationService;
import io.kestra.core.exceptions.FlowNotFoundException;
import io.kestra.core.executor.command.Create;
import io.kestra.core.killswitch.EvaluationType;
import io.kestra.core.killswitch.KillSwitchService;
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
public class CreateCommandHandler {

    private final FlowMetaStoreInterface flowMetaStore;
    private final ExecutionService executionService;
    private final ExecutionStateStore executionStateStore;
    private final ExecutionEventMessageHandler executionEventMessageHandler;
    private final AsyncOperationService asyncOperationService;
    private final KillSwitchService killSwitchService;

    @Inject
    public CreateCommandHandler(
        FlowMetaStoreInterface flowMetaStore,
        ExecutionService executionService,
        ExecutionStateStore executionStateStore,
        ExecutionEventMessageHandler executionEventMessageHandler,
        AsyncOperationService asyncOperationService,
        KillSwitchService killSwitchService) {
        this.flowMetaStore = flowMetaStore;
        this.executionService = executionService;
        this.executionStateStore = executionStateStore;
        this.executionEventMessageHandler = executionEventMessageHandler;
        this.asyncOperationService = asyncOperationService;
        this.killSwitchService = killSwitchService;
    }

    public Optional<ExecutorContext> handle(Create createCommand) {
        AsyncOperationProcessedEvent.Outcome outcome = AsyncOperationProcessedEvent.Outcome.SUCCEEDED;
        String error = null;
        try {
            var flow = flowMetaStore
                .findById(createCommand.tenantId(), createCommand.namespace(), createCommand.flowId(), Optional.ofNullable(createCommand.flowRevision()))
                .orElseThrow(() -> new FlowNotFoundException(createCommand.executionFullId(), createCommand.flowRevision()));

            var newExecution = executionService.create(createCommand, flow);

            // Persist the execution before processing the state-machine event.
            // Any persistence failure is a hard error — the execution must exist in the DB
            // before we signal success back to the caller.
            executionStateStore.create(newExecution);

            // Re-evaluate the kill switch now that the execution exists in the DB.
            // The pre-check in DefaultExecutor.executionCommandQueue() skips non-existent executions,
            // so this is the definitive check for newly created ones.
            EvaluationType evaluationType = killSwitchService.evaluate(newExecution);
            if (evaluationType != EvaluationType.PASS) {
                log.warn("Kill switch active ({}): execution {} persisted in CREATED state but will not be processed", evaluationType, newExecution.getId());
                return Optional.empty();
            }

            var eventType = newExecution.getState().isCreated() ? ExecutionEventType.CREATED : ExecutionEventType.UPDATED;
            return executionEventMessageHandler.handle(new ExecutionEvent(newExecution, eventType));
        } catch (Exception e) {
            log.error("Unable to process Create command for execution {}: ignoring command with eventId {}",
                createCommand.executionId(), createCommand.eventId(), e);
            outcome = AsyncOperationProcessedEvent.Outcome.FAILED;
            error = e.getMessage();
            return Optional.empty();
        } finally {
            asyncOperationService.emitProcessedIfAsync(createCommand, createCommand.tenantId(), createCommand.executionId(), outcome, error);
        }
    }
}
