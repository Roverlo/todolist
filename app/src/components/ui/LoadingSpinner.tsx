import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  fullScreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'medium', 
  text = '加载中...',
  fullScreen = false 
}) => {
  const spinnerClass = `loading-spinner loading-spinner-${size}`;
  const containerClass = fullScreen ? 'loading-container loading-fullscreen' : 'loading-container';

  return (
    <div className={containerClass}>
      <div className={spinnerClass}>
        <div className="spinner-ring">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
        </div>
      </div>
      {text && <p className="loading-text">{text}</p>}
    </div>
  );
};

interface LoadingOverlayProps {
  visible: boolean;
  text?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ 
  visible, 
  text = '处理中...' 
}) => {
  if (!visible) return null;

  return (
    <div className="loading-overlay">
      <LoadingSpinner size="large" text={text} />
    </div>
  );
};

// 骨架屏组件
export const SkeletonLoader: React.FC<{ lines?: number }> = ({ lines = 3 }) => {
  return (
    <div className="skeleton-loader">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="skeleton-line">
          <div className="skeleton-shimmer"></div>
        </div>
      ))}
    </div>
  );
};

// 表格骨架屏
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ 
  rows = 5, 
  cols = 5 
}) => {
  return (
    <table className="table-skeleton">
      <thead>
        <tr>
          {Array.from({ length: cols }).map((_, index) => (
            <th key={index}>
              <div className="skeleton-line">
                <div className="skeleton-shimmer"></div>
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <tr key={rowIndex}>
            {Array.from({ length: cols }).map((_, colIndex) => (
              <td key={colIndex}>
                <div className="skeleton-line">
                  <div className="skeleton-shimmer"></div>
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
