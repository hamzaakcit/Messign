import React from 'react';
import { DoraChatAvatar } from './DoraPilot';

interface DoraAvatarProps {
  size?: number;
  isThinking?: boolean;
  className?: string;
}

const DoraAvatar: React.FC<DoraAvatarProps> = ({
  size = 40,
  isThinking = false,
}) => {
  return <DoraChatAvatar size={size} isThinking={isThinking} />;
};

export default DoraAvatar;
