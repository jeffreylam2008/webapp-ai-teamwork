'use client';

import React from 'react';
import { Form, Input, Select, Row, Col, InputNumber, DatePicker, Switch, Upload, Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { FormInstance, Rule } from 'antd/es/form';

const { Option } = Select;
const { TextArea } = Input;

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'date' | 'switch' | 'upload' | 'email' | 'phone' | 'password';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  rules?: Rule[];
  span?: number; // Col span (default: 12)
  disabled?: boolean;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  rows?: number; // For textarea
  accept?: string; // For upload
  multiple?: boolean; // For upload
}

interface CrudFormProps {
  fields: FormField[];
  initialValues?: Record<string, string | number | boolean>;
  onFinish: (values: Record<string, string | number | boolean>) => void;
  layout?: 'horizontal' | 'vertical';
  size?: 'small' | 'middle' | 'large';
  formRef?: React.RefObject<FormInstance>;
}

const CrudForm: React.FC<CrudFormProps> = ({
  fields,
  initialValues = {},
  onFinish,
  layout = 'vertical',
  size = 'middle',
  formRef
}) => {
  const [form] = Form.useForm();
  
  // Use provided form ref or create new one
  const formInstance = formRef?.current || form;

  const renderField = (field: FormField) => {
    const commonProps = {
      placeholder: field.placeholder,
      disabled: field.disabled,
      size
    };

    switch (field.type) {
      case 'text':
      case 'email':
      case 'password':
        return (
          <Input
            {...commonProps}
            type={field.type === 'email' ? 'email' : field.type === 'password' ? 'password' : 'text'}
          />
        );
      
      case 'phone':
        return (
          <Input
            {...commonProps}
            type="tel"
            maxLength={8}
            onKeyPress={(e) => {
              if (!/[0-9]/.test(e.key)) {
                e.preventDefault();
              }
            }}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 8);
              e.target.value = value;
            }}
          />
        );

      case 'number':
        return (
          <InputNumber
            {...commonProps}
            min={field.min}
            max={field.max}
            style={{ width: '100%' }}
          />
        );

      case 'select':
        return (
          <Select {...commonProps}>
            {field.options?.map(option => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
        );

      case 'textarea':
        return (
          <TextArea
            {...commonProps}
            rows={field.rows || 3}
          />
        );

      case 'date':
        return (
          <DatePicker
            {...commonProps}
            style={{ width: '100%' }}
          />
        );

      case 'switch':
        return (
          <Switch 
            disabled={field.disabled}
            checked={formInstance?.getFieldValue(field.name)}
            onChange={(checked) => formInstance?.setFieldValue(field.name, checked)}
          />
        );

      case 'upload':
        return (
          <Upload
            {...commonProps}
            accept={field.accept}
            multiple={field.multiple}
            beforeUpload={() => false} // Prevent auto upload
          >
            <Button icon={<UploadOutlined />}>Click to Upload</Button>
          </Upload>
        );

      default:
        return <Input {...commonProps} />;
    }
  };

  const renderFormItem = (field: FormField) => {
    const rules = field.rules || [];
    
    if (field.required && !rules.some(rule => 'required' in rule && rule.required)) {
      rules.unshift({ required: true, message: `Please enter ${field.label.toLowerCase()}` });
    }

    // Add type-specific validation
    if (field.type === 'email' && !rules.some(rule => 'type' in rule && rule.type === 'email')) {
      rules.push({ type: 'email', message: 'Please enter a valid email address' });
    }

    return (
      <Col key={field.name} span={field.span || 12}>
        <Form.Item
          name={field.name}
          label={field.label}
          rules={rules}
          initialValue={field.defaultValue}
        >
          {renderField(field)}
        </Form.Item>
      </Col>
    );
  };

  return (
    <Form
      form={formInstance}
      layout={layout}
      initialValues={initialValues}
      onFinish={onFinish}
      size={size}
    >
      <Row gutter={16}>
        {fields.map(renderFormItem)}
      </Row>
    </Form>
  );
};

export default CrudForm; 