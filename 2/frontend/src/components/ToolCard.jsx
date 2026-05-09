import { Link } from 'react-router-dom';

export default function ToolCard({ tool }) {
  const statusColors = {
    available: 'bg-green-100 text-green-800',
    borrowed: 'bg-red-100 text-red-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
  };

  const statusText = {
    available: '可借',
    borrowed: '已借出',
    maintenance: '维护中',
  };

  return (
    <Link to={`/tools/${tool.id}`} className="block">
      <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300">
        <div className="aspect-video bg-gray-100 overflow-hidden">
          {tool.image ? (
            <img
              src={tool.image}
              alt={tool.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl text-gray-400">
              🔧
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-800">{tool.name}</h3>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[tool.status]}`}>
              {statusText[tool.status]}
            </span>
          </div>
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">
            {tool.description}
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">{tool.category}</span>
            <span className="text-gray-500">
              拥有者: {tool.owner?.name}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
