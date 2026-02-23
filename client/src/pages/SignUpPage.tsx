import { Link } from 'react-router-dom';
import { UserPlus, ArrowLeft } from 'lucide-react';

export function SignUpPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
            <UserPlus className="w-7 h-7 text-blue-600" />
          </div>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Create an account</h1>
        <p className="text-gray-600 text-sm mb-6">
          Accounts are created by your administrator. Contact them to get access to Messign.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}
