package io.kestra.executor.handler;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import io.kestra.core.async.AsyncOperationProcessedEvent.Outcome;
import io.kestra.core.async.AsyncOperationService;
import io.kestra.core.executor.command.Replay;
import io.kestra.core.models.executions.Execution;
import io.kestra.core.models.flows.Flow;
import io.kestra.core.models.flows.FlowWithSource;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ReplayCommandHandlerTest {

    @Mock FlowMetaStoreInterface flowMetaStore;
    @Mock ExecutionService executionService;
    @Mock ExecutionStateStore executionStateStore;
    @Mock ExecutionEventMessageHandler executionEventMessageHandler;
    @Mock AsyncOperationService asyncOperationService;

    ReplayCommandHandler handler;
    Execution sourceExecution;
    Replay command;

    @BeforeEach
    void setUp() {
        handler = new ReplayCommandHandler(
            flowMetaStore,
            executionService,
            executionStateStore,
            executionEventMessageHandler,
            asyncOperationService
        );
        sourceExecution = mockExecution("source-exec-id", "tenant", "ns", "flow-id");
        command = Replay.from(sourceExecution, "new-exec-id", null, null, null)
            .withOperationId("op-1");
    }

    @Test
    void shouldEmitSucceededOutcomeOnHappyPath() throws Exception {
        // Given
        var flow = mock(FlowWithSource.class);
        var newExecution = mockExecution("new-exec-id", "tenant", "ns", "flow-id");
        var context = mock(ExecutorContext.class);
        when(executionStateStore.findById("source-exec-id")).thenReturn(sourceExecution);
        when(flowMetaStore.findByExecutionThenInjectDefaults(any())).thenReturn(Optional.of(flow));
        when(executionService.replay(any(), eq(flow), isNull(), isNull(), any(), eq(true), eq("new-exec-id")))
            .thenReturn(newExecution);
        when(executionEventMessageHandler.handle(any())).thenReturn(Optional.of(context));

        // When
        Optional<ExecutorContext> result = handler.handle(command);

        // Then
        assertThat(result).contains(context);
        verify(asyncOperationService).emitProcessedIfAsync(command, "tenant", "new-exec-id", Outcome.SUCCEEDED, null);
    }

    @Test
    void shouldEmitFailedOutcomeWhenSourceExecutionNotFound() {
        // Given — source execution does not exist
        when(executionStateStore.findById("source-exec-id")).thenReturn(null);

        // When — must not throw
        assertThatCode(() -> handler.handle(command)).doesNotThrowAnyException();

        // Then — FAILED outcome, not SUCCEEDED
        verify(asyncOperationService).emitProcessedIfAsync(eq(command), eq("tenant"), eq("new-exec-id"), eq(Outcome.FAILED), any());
    }

    @Test
    void shouldEmitFailedOutcomeWhenFlowNotFound() {
        // Given
        when(executionStateStore.findById("source-exec-id")).thenReturn(sourceExecution);
        when(flowMetaStore.findByExecutionThenInjectDefaults(any())).thenReturn(Optional.empty());

        // When — must not throw
        assertThatCode(() -> handler.handle(command)).doesNotThrowAnyException();

        // Then
        verify(asyncOperationService).emitProcessedIfAsync(eq(command), eq("tenant"), eq("new-exec-id"), eq(Outcome.FAILED), any());
    }

    @Test
    void shouldEmitFailedOutcomeWhenStateStoreCreateFails() throws Exception {
        // Given
        var flow = mock(FlowWithSource.class);
        var newExecution = mockExecution("new-exec-id", "tenant", "ns", "flow-id");
        when(executionStateStore.findById("source-exec-id")).thenReturn(sourceExecution);
        when(flowMetaStore.findByExecutionThenInjectDefaults(any())).thenReturn(Optional.of(flow));
        when(executionService.replay(any(), any(), any(), any(), any(), eq(true), eq("new-exec-id")))
            .thenReturn(newExecution);
        doThrow(new RuntimeException("DB unavailable")).when(executionStateStore).create(newExecution);

        // When — must not throw
        assertThatCode(() -> handler.handle(command)).doesNotThrowAnyException();

        // Then — FAILED outcome, not SUCCEEDED
        verify(asyncOperationService).emitProcessedIfAsync(eq(command), eq("tenant"), eq("new-exec-id"), eq(Outcome.FAILED), any());
    }

    @Test
    void shouldApplyRevisionWhenSpecified() throws Exception {
        // Given
        var commandWithRevision = command.withRevision(3);
        var flow = mock(Flow.class);
        var newExecution = mockExecution("new-exec-id", "tenant", "ns", "flow-id");
        var context = mock(ExecutorContext.class);
        when(executionStateStore.findById("source-exec-id")).thenReturn(sourceExecution);
        when(flowMetaStore.findById("tenant", "ns", "flow-id", Optional.of(3))).thenReturn(Optional.of(flow));
        when(executionService.replay(any(), eq(flow), isNull(), eq(3), any(), eq(true), eq("new-exec-id")))
            .thenReturn(newExecution);
        when(executionEventMessageHandler.handle(any())).thenReturn(Optional.of(context));

        // When
        Optional<ExecutorContext> result = handler.handle(commandWithRevision);

        // Then
        assertThat(result).contains(context);
        verify(flowMetaStore).findById("tenant", "ns", "flow-id", Optional.of(3));
    }

    // ---- helpers ----

    private Execution mockExecution(String execId, String tenantId, String namespace, String flowId) {
        var state = mock(State.class);
        when(state.isCreated()).thenReturn(false);
        var execution = mock(Execution.class);
        when(execution.getId()).thenReturn(execId);
        when(execution.getTenantId()).thenReturn(tenantId);
        when(execution.getNamespace()).thenReturn(namespace);
        when(execution.getFlowId()).thenReturn(flowId);
        when(execution.getState()).thenReturn(state);
        return execution;
    }
}
