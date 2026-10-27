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

export const list = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await listAssetTypes(req.user) }),
);
export const get = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await getAssetType(req.user, req.params.id) }),
);
export const create = asyncHandler(async (req, res) =>
  res.status(201).json({
    success: true,
    data: await createAssetType(req.user, nameSchema.parse(req.body).name),
  }),
);
export const update = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    data: await updateAssetType(req.user, req.params.id, nameSchema.parse(req.body).name),
  }),
);
export const remove = asyncHandler(async (req, res) => {
  await deleteAssetType(req.user, req.params.id);
  res.json({ success: true });
});
export const form = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await getForm(req.user, req.params.id) }),
);
export const save = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    data: await saveForm(req.user, req.params.id, formSchema.parse(req.body).fields),
  }),
);
