import { describe, it, expect, vi } from 'vitest';
import { render, screen, renderHook, waitFor, act } from '@testing-library/react';
import { AppProvider, useAppContext, AppEvent } from '../AppContext';
import React from 'react';

// Mock the Tauri API
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

describe('AppContext', () => {
  it('provides appDatabase instance', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    expect(result.current.appDatabase).toBeDefined();
    expect(result.current.appDatabase.constructor.name).toBe('AppDatabase');
  });

  it('provides hoylandController instance', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    expect(result.current.hoylandController).toBeDefined();
    expect(result.current.hoylandController.constructor.name).toBe('HoylandController');
  });

  it('provides programRunner instance', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    expect(result.current.programRunner).toBeDefined();
    expect(result.current.programRunner.constructor.name).toBe('ProgramRunner');
  });

  it('initializes with empty events array', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    expect(result.current.events).toEqual([]);
  });

  it('provides addEvent function', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    expect(result.current.addEvent).toBeDefined();
    expect(typeof result.current.addEvent).toBe('function');
  });

  it('addEvent adds events to the events array', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    const event: AppEvent = { type: 'test_event', payload: 'test payload' };

    result.current.addEvent(event);

    waitFor(() => {
      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0]).toEqual(event);
    });
  });

  it('addEvent accumulates multiple events', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    const event1: AppEvent = { type: 'event1', payload: 'payload1' };
    const event2: AppEvent = { type: 'event2', payload: 'payload2' };
    const event3: AppEvent = { type: 'event3', payload: 'payload3' };

    result.current.addEvent(event1);
    result.current.addEvent(event2);
    result.current.addEvent(event3);

    waitFor(() => {
      expect(result.current.events).toHaveLength(3);
      expect(result.current.events[0]).toEqual(event1);
      expect(result.current.events[1]).toEqual(event2);
      expect(result.current.events[2]).toEqual(event3);
    });
  });

  it('initializes with an empty errors array', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    expect(result.current.errors).toEqual([]);
  });

  it('derives errors from the most recent message_fail events', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    act(() => {
      result.current.addEvent({ type: 'message_success', payload: 'ok' });
      result.current.addEvent({ type: 'message_fail', payload: 'WMF failed' });
      result.current.addEvent({ type: 'reconnected', payload: '/dev/ttyUSB0' });
      result.current.addEvent({ type: 'message_fail', payload: 'WFF failed' });
    });

    expect(result.current.errors).toEqual(['WMF failed', 'WFF failed']);
  });

  it('errors only retains the last 5 failure messages', () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    act(() => {
      for (let i = 1; i <= 7; i++) {
        result.current.addEvent({ type: 'message_fail', payload: `fail ${i}` });
      }
    });

    expect(result.current.errors).toHaveLength(5);
    expect(result.current.errors[0]).toBe('fail 3');
    expect(result.current.errors[4]).toBe('fail 7');
  });

  it('throws error when useAppContext is used outside AppProvider', () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = vi.fn();

    expect(() => {
      renderHook(() => useAppContext());
    }).toThrow('useAppContext must be used within an AppProvider');

    console.error = originalError;
  });

  it('provides the same instances across re-renders', () => {
    const TestComponent = () => {
      const ctx = useAppContext();
      return <div>{ctx.appDatabase ? 'has db' : 'no db'}</div>;
    };

    const { result, rerender } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });

    const initialDb = result.current.appDatabase;
    const initialController = result.current.hoylandController;
    const initialRunner = result.current.programRunner;

    rerender();

    expect(result.current.appDatabase).toBe(initialDb);
    expect(result.current.hoylandController).toBe(initialController);
    expect(result.current.programRunner).toBe(initialRunner);
  });

  it('renders children correctly', () => {
    render(
      <AppProvider>
        <div>Test content</div>
      </AppProvider>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });
});
