import { z } from "zod";
import { asyncHandler } from "../../utils/errors.js";
import {
  createAssetType,
  deleteAssetType,
  getAssetType,
  getForm,
  listAssetTypes,
  saveForm,
  updateAssetType,
} from "./service.js";

const nameSchema = z.object({ name: z.string().trim().min(1).max(150) });
const formSchema = z.object({
  fields: z
    .array(
      z.object({
        fieldDefinitionId: z.coerce.number().int().positive(),
        required: z.boolean().default(false),
        showInList: z.boolean().default(true),
      }),
    )
    .max(100),
});

export const list = asyncHandler(async (_req, res) =>
  res.json({ success: true, data: await listAssetTypes() }),
);
export const get = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await getAssetType(req.params.id) }),
);
export const create = asyncHandler(async (req, res) =>
  res.status(201).json({
    success: true,
    data: await createAssetType(nameSchema.parse(req.body).name),
  }),
);
export const update = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    data: await updateAssetType(req.params.id, nameSchema.parse(req.body).name),
  }),
);
export const remove = asyncHandler(async (req, res) => {
  await deleteAssetType(req.params.id);
  res.json({ success: true });
});
export const form = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await getForm(req.params.id) }),
);
export const save = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    data: await saveForm(req.params.id, formSchema.parse(req.body).fields),
  }),
);
