import { motion } from 'framer-motion';

interface LoginWelcomeHeadlineProps {
  /** When true, subtitle fades in (e.g. after left hero signals ready). */
  animate: boolean;
}

const SUB = 'Sign in to access your workspace';

/**
 * Subtitle under Dora/Lucy on the login card (no primary headline — crew is the hero).
 */
export function LoginWelcomeHeadline({ animate }: LoginWelcomeHeadlineProps): JSX.Element {
  return (
    <div className="mb-5 text-center">
      <motion.p
        className="text-[13px] text-white/50"
        initial={false}
        animate={animate ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
        transition={{ duration: 0.4, delay: animate ? 0.06 : 0, ease: [0.22, 1, 0.36, 1] }}
      >
        {SUB}
      </motion.p>
    </div>
  );
}
