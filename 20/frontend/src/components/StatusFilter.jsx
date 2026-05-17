import React from 'react';

const STATUS_OPTIONS = [
  { value: 'all', label: '全部', color: 'bg-gray-500' },
  { value: 'pending', label: '待审核', color: 'bg-yellow-500' },
  { value: 'planned', label: '计划中', color: 'bg-blue-500' },
  { value: 'in-progress', label: '进行中', color: 'bg-purple-500' },
  { value: 'completed', label: '已完成', color: 'bg-green-500' },
  { value: 'rejected', label: '已拒绝', color: 'bg-red-500' },
];

export default function StatusFilter({ currentStatus, onStatusChange }) {
  return (
    <div className="bg-white rounded-xl shadow-lg p-4">
      <h3 className="text-sm font-medium text-gray-600 mb-3">按状态筛选</h3>
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onStatusChange(option.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              currentStatus === option.value
                ? `${option.color} text-white shadow-md`
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
