import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
    };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Unknown runtime error',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AppErrorBoundary caught error:', error, errorInfo?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <LinearGradient colors={['#050816', '#0b1130', '#11183e']} style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center px-8">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-red-500/20">
            <Text className="text-3xl">!</Text>
          </View>
          <Text className="text-2xl font-bold text-white">Something went wrong</Text>
          <Text className="mt-2 text-center text-sm text-slate-300">The app hit an unexpected runtime error.</Text>
          {!!this.state.message && (
            <Text className="mt-2 text-center text-xs text-slate-400">{this.state.message}</Text>
          )}

          <Pressable onPress={this.handleReset} className="mt-5 rounded-xl bg-violet-600 px-5 py-3">
            <Text className="text-sm font-semibold text-white">Try Again</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }
}
