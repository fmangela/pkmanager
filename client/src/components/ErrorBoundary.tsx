import React from 'react';
import { Result, Button, Space, Typography } from 'antd';
import { BugOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons';
import { useDiagnosticStore } from '../stores/diagnosticStore';

const { Text, Paragraph } = Typography;

// ── Props ──────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional name for this boundary (shown in fallback UI and logs). */
  name?: string;
}

// ── Fallback UI (separate so it can use hooks) ─────────────────────

const CrashFallback: React.FC<{
  error: Error;
  errorInfo: React.ErrorInfo;
  boundaryName?: string;
  onReset: () => void;
}> = ({ error, errorInfo, boundaryName, onReset }) => {
  // We can use hooks here because this component is rendered normally
  // (not during the error-throwing render)

  const handleCopyError = () => {
    const text = [
      `pkmanager Crash Report`,
      `Time: ${new Date().toISOString()}`,
      `Boundary: ${boundaryName || 'root'}`,
      `URL: ${window.location.href}`,
      `Error: ${error.message}`,
      `Stack: ${error.stack}`,
      `Component Stack: ${errorInfo.componentStack}`,
    ].join('\n');

    navigator.clipboard.writeText(text).catch(() => {
      // Fallback: select from a textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  };

  const handleOpenDiagnostic = () => {
    // Dispatch a custom event that DiagnosticPanel listens for
    window.dispatchEvent(new CustomEvent('pkmanager:open-diag'));
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        padding: 24,
      }}
    >
      <Result
        status="error"
        title="页面遇到了一个错误"
        subTitle={
          <Paragraph type="secondary" style={{ maxWidth: 480, margin: '0 auto' }}>
            <Text type="danger" strong>
              {error.message}
            </Text>
            {boundaryName && (
              <>
                <br />
                位置: <Text code>{boundaryName}</Text>
              </>
            )}
          </Paragraph>
        }
        extra={
          <Space>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={onReset}
            >
              刷新页面
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleCopyError}>
              复制错误
            </Button>
            <Button icon={<BugOutlined />} onClick={handleOpenDiagnostic}>
              诊断面板
            </Button>
          </Space>
        }
      >
        {/* eslint-disable-next-line react/no-unescaped-entities */}
        <details style={{ maxWidth: 600, margin: '16px auto', textAlign: 'left' }}>
          <summary style={{ cursor: 'pointer', color: '#888' }}>
            技术详情
          </summary>
          <pre
            style={{
              fontSize: 11,
              color: '#666',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              marginTop: 8,
              padding: 8,
              background: '#f5f5f5',
              borderRadius: 4,
              maxHeight: 300,
              overflow: 'auto',
            }}
          >
            {error.stack}
            {'\n\n'}
            {'── Component Stack ──\n'}
            {errorInfo.componentStack}
          </pre>
        </details>
      </Result>
    </div>
  );
};

// ── Error Boundary (Class Component) ───────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundaryClass extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    // Log to diagnostic store
    try {
      const store = useDiagnosticStore.getState();
      store.log({
        category: 'render',
        level: 'error',
        message: `[${this.props.name || 'root'}] ${error.message}`,
        stack: error.stack,
        context: errorInfo.componentStack?.slice(0, 500),
      });
    } catch {
      // Must not throw — diagnostic store itself could be the crash source
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  handleReset = () => {
    // Clear error state and remount children
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Trigger a full page reload after a short delay
    // (this gives time for any diagnostic upload to complete)
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <CrashFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo || { componentStack: '' }}
          boundaryName={this.props.name}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

// ── Export ──────────────────────────────────────────────────────────

/**
 * React Error Boundary that catches rendering errors in its subtree,
 * logs them to the diagnostic store, and displays a user-friendly
 * fallback UI instead of a white screen.
 */
const ErrorBoundary: React.FC<ErrorBoundaryProps> = (props) => {
  // Key on name so remounting resets error state
  return <ErrorBoundaryClass key={props.name} {...props} />;
};

export default ErrorBoundary;
