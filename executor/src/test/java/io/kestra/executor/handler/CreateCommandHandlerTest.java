package io.kestra.executor.handler;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.kestra.core.async.AsyncOperationProcessedEvent.Outcome;
import io.kestra.core.async.AsyncOperationService;
import io.kestra.core.executor.command.Create;
import io.kestra.core.killswitch.EvaluationType;
import io.kestra.core.killswitch.KillSwitchService;
import io.kestra.core.models.executions.Execution;
import io.kestra.core.models.executions.ExecutionId;
import io.kestra.core.models.flows.FlowInterface;
import io.kestra.core.models.flows.State;
import io.kestra.core.runners.FlowMetaStoreInterface;
import io.kestra.core.services.ExecutionService;
import io.kestra.executor.ExecutionStateStore;
import io.kestra.executor.ExecutorContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CreateCommandHandlerTest {

    @Mock FlowMetaStoreInterface flowMetaStore;
    @Mock ExecutionService executionService;
    @Mock ExecutionStateStore executionStateStore;
    @Mock ExecutionEventMessageHandler executionEventMessageHandler;
    @Mock AsyncOperationService asyncOperationService;
    @Mock KillSwitchService killSwitchService;

    CreateCommandHandler handler;
    Create command;

    @BeforeEach
    void setUp() {
        handler = new CreateCommandHandler(
            flowMetaStore,
            executionService,
            executionStateStore,
            executionEventMessageHandler,
            asyncOperationService,
            killSwitchService
        );
        command = Create.of(new ExecutionId("tenant", "ns", "flow-id", "exec-1", null))
            .withOperationId("op-1");
    }

    @Test
    void shouldEmitSucceededOutcomeOnHappyPath() {
        // Given
        var flow = mock(FlowInterface.class);
        var execution = executionWithState(State.Type.CREATED);
        var context = mock(ExecutorContext.class);
        when(flowMetaStore.findById(any(), any(), any(), any())).thenReturn(Optional.of(flow));
        when(executionService.create(eq(command), eq(flow))).thenReturn(execution);
        when(killSwitchService.evaluate(execution)).thenReturn(EvaluationType.PASS);
        when(executionEventMessageHandler.handle(any())).thenReturn(Optional.of(context));

        // When
        Optional<ExecutorContext> result = handler.handle(command);

        // Then
        assertThat(result).contains(context);
        verify(asyncOperationService).emitProcessedIfAsync(command, "tenant", "exec-1", Outcome.SUCCEEDED, null);
    }

    @Test
    void shouldEmitFailedOutcomeWhenFlowNotFound() {
        // Bug #1: FlowNotFoundException previously escaped the try/finally, so emitProcessedIfAsync
        // was never called and the controller would time out with a 504 instead of a clean error.
        when(flowMetaStore.findById(any(), any(), any(), any())).thenReturn(Optional.empty());

        // When — must not throw
        assertThatCode(() -> handler.handle(command)).doesNotThrowAnyException();

        // Then — FAILED outcome must be signalled so the controller gets a 409, not a 504
        verify(asyncOperationService).emitProcessedIfAsync(eq(command), eq("tenant"), eq("exec-1"), eq(Outcome.FAILED), any());
    }

    @Test
    void shouldEmitFailedOutcomeWhenStateStoreCreateFails() {
        // Bug #2: executionStateStore.create() failure was swallowed (only logged) and the handler
        // continued to emit SUCCEEDED — the controller returned 200 for an execution never persisted.
        var flow = mock(FlowInterface.class);
        var execution = mock(Execution.class); // state stubs not needed — exception fires before getState()
        when(flowMetaStore.findById(any(), any(), any(), any())).thenReturn(Optional.of(flow));
        when(executionService.create(eq(command), eq(flow))).thenReturn(execution);
        doThrow(new RuntimeException("DB unavailable")).when(executionStateStore).create(execution);

        // When — must not throw
        assertThatCode(() -> handler.handle(command)).doesNotThrowAnyException();

        // Then — FAILED outcome, not SUCCEEDED
        verify(asyncOperationService).emitProcessedIfAsync(eq(command), eq("tenant"), eq("exec-1"), eq(Outcome.FAILED), any());
    }

    @Test
    void shouldEmitFailedOutcomeWhenEventHandlerFails() {
        var flow = mock(FlowInterface.class);
        var execution = executionWithState(State.Type.CREATED);
        when(flowMetaStore.findById(any(), any(), any(), any())).thenReturn(Optional.of(flow));
        when(executionService.create(eq(command), eq(flow))).thenReturn(execution);
        when(killSwitchService.evaluate(execution)).thenReturn(EvaluationType.PASS);
        when(executionEventMessageHandler.handle(any())).thenThrow(new RuntimeException("handler error"));

        assertThatCode(() -> handler.handle(command)).doesNotThrowAnyException();

        verify(asyncOperationService).emitProcessedIfAsync(eq(command), eq("tenant"), eq("exec-1"), eq(Outcome.FAILED), any());
    }

    @Test
    void shouldPersistExecutionAndReturnEmptyWhenKillSwitchActive() {
        // Given
        var flow = mock(FlowInterface.class);
        var execution = mock(Execution.class); // no state stubs needed — kill switch fires before getState()
        when(flowMetaStore.findById(any(), any(), any(), any())).thenReturn(Optional.of(flow));
        when(executionService.create(eq(command), eq(flow))).thenReturn(execution);
        when(killSwitchService.evaluate(execution)).thenReturn(EvaluationType.IGNORE);

        // When
        Optional<ExecutorContext> result = handler.handle(command);

        // Then — execution was persisted but not processed further
        assertThat(result).isEmpty();
        verify(executionStateStore).create(execution);
        verify(executionEventMessageHandler, never()).handle(any());
        verify(asyncOperationService).emitProcessedIfAsync(command, "tenant", "exec-1", Outcome.SUCCEEDED, null);
    }

    // ---- helpers ----

    private Execution executionWithState(State.Type type) {
        var state = mock(State.class);
        when(state.isCreated()).thenReturn(type == State.Type.CREATED);
        var execution = mock(Execution.class);
        when(execution.getState()).thenReturn(state);
        return execution;
    }
}
