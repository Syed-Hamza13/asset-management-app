import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card } from '../components/ui';
import { AssetForm } from '../components/AssetForm';

export function AssetEditor() {
  const { assetTypeId, publicId } = useParams();
  const editing = Boolean(publicId);
  const nav = useNavigate();
  const [type, setType] = useState(null);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link
          to={editing ? `/assets/${publicId}` : `/asset-types/${assetTypeId}`}
          className="text-sm text-slate-500"
        >
          ← Back
        </Link>
        <h2 className="mt-2 text-2xl font-bold">
          {editing ? 'Edit' : 'Add'} {type?.name ?? ''}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Fill the configured fields below.
        </p>
      </div>
      <Card className="p-6">
        <AssetForm
          assetTypeId={assetTypeId}
          publicId={publicId}
          onTypeLoaded={setType}
          onSaved={() =>
            nav(editing ? `/assets/${publicId}` : `/asset-types/${assetTypeId}`)
          }
          onCancel={() => nav(-1)}
          emptyHint={
            assetTypeId ? (
              <Link
                to={`/asset-types/${assetTypeId}`}
                className="font-semibold text-slate-700 underline"
              >
                Configure Form
              </Link>
            ) : null
          }
        />
      </Card>
    </div>
  );
}
