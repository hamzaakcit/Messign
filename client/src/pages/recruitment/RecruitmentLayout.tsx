import { useLocation } from 'react-router-dom';
import { RecruitmentJobsPage } from './RecruitmentJobsPage';
import { RecruitmentPipelinePage } from './RecruitmentPipelinePage';
import { RecruitmentCandidatesPage } from './RecruitmentCandidatesPage';
import { RecruitmentInterviewsPage } from './RecruitmentInterviewsPage';
import { RecruitmentDashboardPage } from './RecruitmentDashboardPage';

export function RecruitmentLayout() {
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[1];

  switch (segment) {
    case 'pipeline':
      return <RecruitmentPipelinePage />;
    case 'candidates':
      return <RecruitmentCandidatesPage />;
    case 'interviews':
      return <RecruitmentInterviewsPage />;
    case 'dashboard':
      return <RecruitmentDashboardPage />;
    default:
      return <RecruitmentJobsPage />;
  }
}
