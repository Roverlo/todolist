import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message?: string;
  stack?: string;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message,
      stack: error.stack,
    };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[AppErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fatal-overlay">
          <h1>应用运行出错</h1>
          <p>请将以下信息反馈给开发者：</p>
          <pre>{this.state.message}</pre>
          <pre>{this.state.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
