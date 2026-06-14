import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { getFirstGamepad } from '../lib/inputUtil';

type GamepadBinds = Record<string, number[]>;

type Options = {
  gamepadBinds: GamepadBinds;
  deadzone: number;
  onButtonPress: (button: string) => void;
  onButtonUnpress: (button: string) => void;
  enabled: boolean;
};

const AXIS_HYSTERESIS = 0.12;
const EMPTY_AXIS_STATE = {
  Up: false,
  Down: false,
  Left: false,
  Right: false,
};

export function useGamepad(options: Options): { connected: boolean; gamepadId: string | null } {
  const [connected, setConnected] = useState(false);
  const [gamepadId, setGamepadId] = useState<string | null>(null);
  const gamepadBindsRef = useRef<GamepadBinds>(options.gamepadBinds);
  const deadzoneRef = useRef(options.deadzone);
  const onButtonPressRef = useRef(options.onButtonPress);
  const onButtonUnpressRef = useRef(options.onButtonUnpress);
  const connectedRef = useRef(false);
  const gamepadIdRef = useRef<string | null>(null);
  const pressedRef = useRef<Record<string, boolean>>({});
  const axisStateRef = useRef<Record<string, boolean>>({ ...EMPTY_AXIS_STATE });
  const bindingEnabledRef = useRef(options.enabled);

  useEffect(() => {
    gamepadBindsRef.current = options.gamepadBinds;
  }, [options.gamepadBinds]);

  useEffect(() => {
    deadzoneRef.current = options.deadzone;
  }, [options.deadzone]);

  useEffect(() => {
    onButtonPressRef.current = options.onButtonPress;
  }, [options.onButtonPress]);

  useEffect(() => {
    onButtonUnpressRef.current = options.onButtonUnpress;
  }, [options.onButtonUnpress]);

  useEffect(() => {
    bindingEnabledRef.current = options.enabled;
  }, [options.enabled]);

  useEffect(() => {
    const pressedState = pressedRef.current;
    if (!options.enabled) {
      releaseAllButtons(pressedState, axisStateRef, onButtonUnpressRef.current);
      connectedRef.current = false;
      gamepadIdRef.current = null;
      return;
    }

    let raf = 0;
    const syncMeta = (nextConnected: boolean, nextId: string | null) => {
      if (connectedRef.current !== nextConnected) {
        connectedRef.current = nextConnected;
        setConnected(nextConnected);
      }
      if (gamepadIdRef.current !== nextId) {
        gamepadIdRef.current = nextId;
        setGamepadId(nextId);
      }
    };

    const updateButtonState = (button: string, nextPressed: boolean) => {
      const prevPressed = !!pressedRef.current[button];
      if (prevPressed === nextPressed) {
        return;
      }
      pressedRef.current[button] = nextPressed;
      if (nextPressed) {
        onButtonPressRef.current(button);
      } else {
        onButtonUnpressRef.current(button);
      }
    };

    const computeAxisState = (prevActive: boolean, value: number, positive: boolean): boolean => {
      const threshold = clamp(deadzoneRef.current, 0, 1);
      const releaseThreshold = Math.max(0, threshold - AXIS_HYSTERESIS);
      if (positive) {
        return prevActive ? value > releaseThreshold : value > threshold;
      }
      return prevActive ? value < -releaseThreshold : value < -threshold;
    };

    const tick = () => {
      if (!bindingEnabledRef.current) {
        releaseAllButtons(pressedState, axisStateRef, onButtonUnpressRef.current);
        syncMeta(false, null);
        raf = window.requestAnimationFrame(tick);
        return;
      }

      const pad = getFirstGamepad();
      if (!pad) {
        releaseAllButtons(pressedState, axisStateRef, onButtonUnpressRef.current);
        syncMeta(false, null);
        raf = window.requestAnimationFrame(tick);
        return;
      }

      syncMeta(true, pad.id || null);

      const nextStates: Record<string, boolean> = {};
      for (const [button, indices] of Object.entries(gamepadBindsRef.current)) {
        nextStates[button] = indices.some((index) => !!pad.buttons[index]?.pressed);
      }

      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;
      const axisState = axisStateRef.current;
      axisState.Up = computeAxisState(axisState.Up, axisY, false);
      axisState.Down = computeAxisState(axisState.Down, axisY, true);
      axisState.Left = computeAxisState(axisState.Left, axisX, false);
      axisState.Right = computeAxisState(axisState.Right, axisX, true);

      nextStates.Up = !!nextStates.Up || axisState.Up;
      nextStates.Down = !!nextStates.Down || axisState.Down;
      nextStates.Left = !!nextStates.Left || axisState.Left;
      nextStates.Right = !!nextStates.Right || axisState.Right;

      const seen = new Set(Object.keys(nextStates));
      for (const [button, nextPressed] of Object.entries(nextStates)) {
        updateButtonState(button, nextPressed);
      }
      for (const [button, prevPressed] of Object.entries(pressedRef.current)) {
        if (!seen.has(button) && prevPressed) {
          updateButtonState(button, false);
        }
      }

      raf = window.requestAnimationFrame(tick);
    };

    const handleConnected = () => {
      const pad = getFirstGamepad();
      syncMeta(!!pad, pad?.id || null);
    };

    const handleDisconnected = () => {
      releaseAllButtons(pressedState, axisStateRef, onButtonUnpressRef.current);
      const pad = getFirstGamepad();
      syncMeta(!!pad, pad?.id || null);
    };

    window.addEventListener('gamepadconnected', handleConnected);
    window.addEventListener('gamepaddisconnected', handleDisconnected);
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('gamepadconnected', handleConnected);
      window.removeEventListener('gamepaddisconnected', handleDisconnected);
      window.cancelAnimationFrame(raf);
      releaseAllButtons(pressedState, axisStateRef, onButtonUnpressRef.current);
    };
  }, [options.enabled]);

  return {
    connected: options.enabled ? connected : false,
    gamepadId: options.enabled ? gamepadId : null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function releaseAllButtons(
  pressedState: Record<string, boolean>,
  axisStateRef: MutableRefObject<Record<string, boolean>>,
  onButtonUnpress: (button: string) => void,
): void {
  for (const [button, pressed] of Object.entries(pressedState)) {
    if (pressed) {
      onButtonUnpress(button);
    }
  }
  for (const key of Object.keys(pressedState)) {
    delete pressedState[key];
  }
  axisStateRef.current = { ...EMPTY_AXIS_STATE };
}
